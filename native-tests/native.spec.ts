import { expect, test, type Page } from '@playwright/test';
import { asheville, forecastFixture, tokyo } from '../src/test/fixtures';
import { installBridge, savedState, storageKey } from './bridge';

async function forecast(page: Page) {
  const requests: string[] = [];
  await page.route('https://api.open-meteo.com/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(forecastFixture(Date.now())) });
  });
  return requests;
}
async function loaded(page: Page) { await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible(); }

test('native bundle hydrates durable preferences before writing and omits browser installation', async ({ page }, testInfo) => {
  const bridge = await installBridge(page);
  bridge.control.hydrationDelayMs = 200;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify({ ...state, selected: state.places[1], preferences: { ...state.preferences, units: 'metric' } })), { key: storageKey, state: savedState });
  await forecast(page); await page.goto('/'); await loaded(page);
  await expect(page).toHaveTitle('Asheville · 8-Bit Weather');
  await expect(page.locator('html')).toHaveClass(/native-app/);
  await expect(page.getByRole('heading', { name: '72° Fahrenheit' })).toBeVisible();
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', 'blue-ridge');
  await expect.poll(() => bridge.calls.filter(call => call.plugin === 'Preferences' && call.method === 'set').length).toBeGreaterThan(0);
  const firstWrite = bridge.calls.findIndex(call => call.plugin === 'Preferences' && call.method === 'set');
  const read = bridge.calls.findIndex(call => call.plugin === 'Preferences' && call.method === 'get');
  expect(firstWrite).toBeGreaterThan(read);
  expect(JSON.parse(String(bridge.calls[firstWrite].options?.value)).selected.id).toBe(asheville.id);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.landscape-art').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: `/tmp/8bit-weather-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /How to install|Install app/ })).toHaveCount(0);
  expect(await page.evaluate(() => window.__serviceWorkerRegistrations)).toBe(0);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length))).toBe(0);
  expect(errors).toEqual([]);
});

test('unit changes and cached forecasts survive a fresh offline JS context using Preferences', async ({ page }) => {
  const { store } = await installBridge(page);
  await forecast(page); await page.goto('/'); await loaded(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: '°C / km/h', exact: true }).click();
  await expect.poll(() => JSON.parse(store.get(storageKey)!).preferences.units).toBe('metric');
  await expect.poll(() => store.has(`${storageKey}:forecasts`)).toBe(true);
  // Keep localhost reachable as the stand-in for bundled capacitor:// assets.
  // All weather networking fails and WebKit localStorage is explicitly empty.
  await page.unroute('https://api.open-meteo.com/**');
  await page.route('https://api.open-meteo.com/**', route => route.abort('internetdisconnected'));
  await page.addInitScript(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  await page.reload(); await loaded(page);
  await expect(page.getByRole('heading', { name: '22° Celsius' })).toBeVisible();
  await expect(page.getByText('You’re offline. Showing your saved forecast.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await expect(page.locator('.day-row')).toHaveCount(7);
});

test('native location permission errors preserve manual search and successful coordinates are rounded', async ({ page }) => {
  const bridge = await installBridge(page, {});
  bridge.control.permission = 'denied';
  await forecast(page); await page.goto('/');
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Allow location in iPhone Settings');
  await expect(page.getByRole('button', { name: 'Search for a city' })).toBeEnabled();
  expect(bridge.calls.some(call => call.method === 'getCurrentPosition')).toBe(false);
  bridge.control.permission = 'granted'; bridge.control.positionError = 'OS-PLUG-GLOC-0010';
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('took too long');
  bridge.control.positionError = '';
  await page.getByRole('button', { name: 'Use my location', exact: true }).click(); await loaded(page);
  await expect(page.getByRole('button', { name: 'Change location, Current location' })).toBeVisible();
  await expect.poll(() => JSON.parse(bridge.store.get(storageKey)!).selected.latitude).toBe(35.595);
  expect(JSON.parse(bridge.store.get(storageKey)!).selected.longitude).toBe(-82.552);
});

test('widget receives matching weather and deep links select saved places on cold and warm launch', async ({ page }) => {
  const bridge = await installBridge(page);
  bridge.control.launchUrl = `eightbitweather://place?id=${tokyo.id}`;
  await forecast(page); await page.goto('/'); await loaded(page);
  await expect(page.getByRole('button', { name: 'Change location, Tokyo' })).toBeVisible();
  await expect.poll(() => bridge.widgets.at(-1)?.weather?.placeId).toBe(tokyo.id);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.evaluate(id => window.__emitNative('appUrlOpen', { url: `eightbitweather://place?id=${id}` }), asheville.id);
  await loaded(page);
  await expect(page.getByRole('button', { name: 'Change location, Asheville' })).toBeVisible();
  await expect.poll(() => bridge.widgets.at(-1)?.weather?.placeId).toBe(asheville.id);
  const payload = bridge.widgets.at(-1)!;
  expect(payload.place.id).toBe(asheville.id); expect(payload.landscape).toBe('blue-ridge'); expect(payload.units).toBe('imperial');
  expect(payload.weather?.current.temperature).toBe(22.2);
  expect(payload.weather?.daily[0]).toMatchObject({ high: 25, low: 15 });
  await page.evaluate(() => window.__emitNative('appUrlOpen', { url: 'https://evil.example/place?id=1850147' }));
  await expect(page.getByRole('button', { name: 'Change location, Asheville' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Clear saved data', exact: true }).click();
  await page.getByRole('button', { name: 'Clear everything', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find your weather' })).toBeVisible();
  await expect.poll(() => bridge.widgets.at(-1)).toBeNull();
  await expect.poll(() => bridge.store.has(`${storageKey}:forecasts`)).toBe(false);
});

test('native background pauses user-started audio and stale weather refreshes on resume', async ({ page }) => {
  await installBridge(page);
  const requests = await forecast(page);
  await page.clock.install();
  await page.goto('/'); await loaded(page);
  expect(await page.evaluate(() => window.__nativeAudioContexts.length)).toBe(0);
  await page.getByRole('button', { name: 'Sound off', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__nativeAudioContexts[0]?.state)).toBe('running');
  await page.evaluate(() => window.__emitNative('appStateChange', { isActive: false }));
  await expect.poll(() => page.evaluate(() => window.__nativeAudioContexts[0]?.state)).toBe('suspended');
  const requestsBeforeBackground = requests.length;
  await page.clock.fastForward(16 * 60 * 1000);
  expect(requests.length).toBe(requestsBeforeBackground);
  await page.evaluate(() => window.__emitNative('appStateChange', { isActive: true }));
  await expect.poll(() => requests.length).toBe(requestsBeforeBackground + 1);
  await expect.poll(() => page.evaluate(() => window.__nativeAudioContexts[0]?.state)).toBe('running');
  await page.reload(); await loaded(page);
  expect(await page.evaluate(() => window.__nativeAudioContexts.length)).toBe(0);
  await expect(page.getByRole('button', { name: 'Sound off', exact: true })).toBeVisible();
});

test('failed Preferences hydration never overwrites durable saved data', async ({ page }) => {
  const bridge = await installBridge(page);
  const original = bridge.store.get(storageKey);
  bridge.control.failReads = true;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your weather' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Saved data is unavailable');
  expect(bridge.store.get(storageKey)).toBe(original);
  expect(bridge.calls.filter(call => call.plugin === 'Preferences' && call.method === 'set')).toEqual([]);
  expect(bridge.widgets).toEqual([]);
});
