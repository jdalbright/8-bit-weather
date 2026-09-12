import { browserApiFixture as apiFixture } from '../src/test/fixtures';
import { expect, test } from '@playwright/test';
import { forecastFixture } from '../src/test/fixtures';
import { installBridge, savedState, storageKey } from './bridge';

async function setup(page: import('@playwright/test').Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const bridge = await installBridge(page, { [storageKey]: JSON.stringify({ ...savedState, preferences: { ...savedState.preferences, reducedMotion: false } }) });
  await page.route('**/api/weather?**', route => { const forecast = forecastFixture(Date.now()); forecast.minutely_15.rain.fill(0.2); return route.fulfill({ json: apiFixture(forecast, route.request().url()), headers: { 'access-control-allow-origin': '*' } }); });
  return bridge;
}

test('haptics are deliberate, disabled independently, and persist after relaunch', async ({ page }) => {
  const bridge = await setup(page);
  const pulses = () => bridge.calls.filter(call => call.plugin === 'NativeExperience' && call.method === 'triggerHaptic');
  await page.goto('/'); await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  expect(pulses()).toHaveLength(0);
  await page.getByRole('button', { name: 'Today', exact: true }).click(); expect(pulses()).toHaveLength(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => pulses().length).toBe(2); expect(pulses()[0].options?.kind).toBe('impact');
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.evaluate(() => window.__emitNative('refresh', { requestId: 42 }));
  await expect.poll(() => pulses().length).toBe(3);
  expect(pulses().slice(1).map(call => call.options)).toEqual([{ kind: 'notification', type: 'success' }, { kind: 'notification', type: 'success' }]);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect.poll(() => pulses().length).toBe(4);
  const toggle = page.getByRole('switch', { name: 'Haptic feedback' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true'); await toggle.click();
  await expect.poll(() => JSON.parse(bridge.store.get(storageKey)!).preferences.haptics).toBe(false);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); expect(pulses()).toHaveLength(4);
  await page.reload(); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false'); expect(pulses()).toHaveLength(4);
});

test('power changes pause scenery while disclosure animation stays enabled', async ({ page }, info) => {
  const bridge = await setup(page); bridge.control.lowPowerMode = true;
  await page.goto('/');
  await expect(page.locator('.scenery')).toHaveAttribute('data-animate', 'false');
  await expect(page.locator('.app-shell')).not.toHaveClass(/motion-reduced/);
  await page.getByRole('button', { name: /UV index .*details/ }).click();
  await expect(page.locator('.uv-disclosure')).toHaveAttribute('data-animate', 'true');
  expect(await page.locator('.uv-disclosure').evaluate(el => getComputedStyle(el).transitionDuration)).not.toBe('0s');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Decorative animation is paused while Low Power Mode is on.')).toBeVisible();
  await page.screenshot({ path: `/tmp/8bit-power-${info.project.name}.png`, fullPage: true });
  await page.evaluate(() => window.__emitNative('powerStateChanged', { lowPowerMode: false, thermalState: 'serious' }));
  await expect(page.getByText('Decorative animation is paused to help your iPhone cool down.')).toBeVisible();
  // Foreground re-read recovers when a power event was missed while backgrounded.
  bridge.control.lowPowerMode = false;
  await page.evaluate(() => { window.__emitNative('appStateChange', { isActive: false }); window.__emitNative('appStateChange', { isActive: true }); });
  await expect(page.getByText(/Decorative animation is paused/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.scenery')).toHaveAttribute('data-animate', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.scenery')).toHaveAttribute('data-animate', 'false');
  await expect(page.locator('.app-shell')).toHaveClass(/motion-reduced/);
});

test('chart selections pulse only when changed and bridge failures do not block navigation', async ({ page }) => {
  const bridge = await setup(page); await page.goto('/');
  await page.getByRole('button', { name: /UV index .*details/ }).click();
  const pulses = () => bridge.calls.filter(call => call.method === 'triggerHaptic');
  expect(pulses()).toHaveLength(0);
  const slider = page.getByRole('slider', { name: 'UV forecast hour' });
  await slider.press('Home'); await slider.press('ArrowRight');
  await expect.poll(() => pulses().length).toBeGreaterThan(0);
  expect(pulses().every(call => call.options?.kind === 'selection')).toBe(true);
  const rain = page.getByRole('slider', { name: 'Rain forecast time' });
  const beforeRain = pulses().length;
  // Let the deliberate 80ms chart-feedback throttle expire between controls.
  await page.waitForTimeout(100);
  await rain.press('End');
  await expect.poll(() => pulses().length).toBe(beforeRain + 1);
  const count = pulses().length;
  await page.evaluate(() => window.__emitNative('appStateChange', { isActive: false }));
  await slider.press('ArrowRight'); expect(pulses()).toHaveLength(count);
  await page.evaluate(() => window.__emitNative('appStateChange', { isActive: true }));
  bridge.control.experienceFailure = true;
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});


test('scene touches and briefing disclosure have distinct textures', async ({ page }) => {
  const bridge = await setup(page); await page.goto('/');
  await expect(page.locator('.scenery')).toBeVisible();
  const pulses = () => bridge.calls.filter(call => call.method === 'triggerHaptic').map(call => call.options);
  await page.locator('[data-discovery="river"]').click();
  await expect.poll(pulses).toEqual([{ kind: 'pattern', name: 'waterRipple' }]);
  await page.waitForTimeout(200);
  await page.locator('[data-discovery="station"]').click();
  await expect.poll(pulses).toHaveLength(2);
  expect(pulses()[1]).toEqual({ kind: 'impact', style: 'rigid' });
  await page.getByRole('button', { name: /Weather briefing/ }).click();
  await expect.poll(pulses).toHaveLength(3);
  expect(pulses()[2]).toEqual({ kind: 'impact', style: 'soft' });
});

test('settings tick on changes and volume steps, warn on clearing, and preview enabling once', async ({ page }) => {
  const bridge = await setup(page); await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const pulses = () => bridge.calls.filter(call => call.method === 'triggerHaptic');
  await expect.poll(() => pulses().length).toBe(1);
  await page.getByRole('button', { name: '°F / mph', exact: true }).click();
  expect(pulses()).toHaveLength(1);
  await page.getByRole('button', { name: '°C / km/h', exact: true }).click();
  await expect.poll(() => pulses().length).toBe(2);
  const volume = page.getByRole('slider', { name: 'Music volume', exact: true });
  await volume.fill('36'); expect(pulses()).toHaveLength(2);
  await volume.fill('40'); await expect.poll(() => pulses().length).toBe(3);
  await volume.fill('1'); await page.waitForTimeout(100); const beforeEndpoint = pulses().length;
  await volume.fill('0'); await expect.poll(() => pulses().length).toBe(beforeEndpoint + 1);
  await volume.fill('100'); await expect.poll(() => pulses().length).toBe(beforeEndpoint + 2);
  await page.getByRole('button', { name: 'Clear saved data', exact: true }).click();
  await expect.poll(() => pulses().at(-1)?.options).toEqual({ kind: 'notification', type: 'warning' });
  const toggle = page.getByRole('switch', { name: 'Haptic feedback', exact: true });
  const count = pulses().length;
  await toggle.click(); await page.getByRole('switch', { name: 'Music', exact: true }).click();
  expect(pulses()).toHaveLength(count);
  await toggle.click(); await expect.poll(() => pulses().length).toBe(count + 1);
  expect(pulses().at(-1)?.options).toEqual({ kind: 'selection' });
});

test('manual failures signal error once while background refreshes stay silent', async ({ page }) => {
  const bridge = await setup(page); await page.goto('/');
  await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  const pulses = () => bridge.calls.filter(call => call.method === 'triggerHaptic').map(call => call.options);
  await page.route('**/api/weather?**', route => route.fulfill({ status: 500, body: 'Unavailable', headers: { 'access-control-allow-origin': '*' } }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(pulses).toEqual([{ kind: 'impact' }, { kind: 'notification', type: 'error' }]);
  await page.evaluate(() => window.__emitNative('refresh', { requestId: 43 }));
  await expect.poll(pulses).toHaveLength(3);
  expect(pulses()[2]).toEqual({ kind: 'notification', type: 'error' });
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); });
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  expect(pulses()).toHaveLength(3);
});

test('late refresh completion does not buzz after navigation or backgrounding', async ({ page }) => {
  const bridge = await setup(page); await page.goto('/');
  await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route('**/api/weather?**', async route => {
    started = true; await held;
    await route.fulfill({ json: apiFixture(forecastFixture(Date.now()), route.request().url()), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await page.evaluate(() => { window.__emitNative('appStateChange', { isActive: false }); window.__emitNative('appStateChange', { isActive: true }); });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  release();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  expect(bridge.calls.filter(call => call.method === 'triggerHaptic' && call.options?.kind === 'notification')).toHaveLength(0);
});


test('new cities and location outcomes each produce one acknowledgement', async ({ page }) => {
  const bridge = await setup(page);
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [
    { id: 4487042, name: 'Raleigh', latitude: 35.78, longitude: -78.64, admin1: 'North Carolina', country: 'United States' }
  ] }, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/'); await page.getByRole('button', { name: 'Places', exact: true }).click();
  const pulses = () => bridge.calls.filter(call => call.method === 'triggerHaptic').map(call => call.options);
  await page.getByRole('searchbox', { name: 'Find a city' }).fill('Raleigh');
  const before = pulses().length;
  await page.getByRole('button', { name: /Raleigh North Carolina/ }).click();
  await expect.poll(pulses).toHaveLength(before + 1);
  expect(pulses().at(-1)).toEqual({ kind: 'notification', type: 'success' });
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page.getByRole('button', { name: /Asheville North Carolina/ }).click();
  await expect.poll(() => pulses().at(-1)).toEqual({ kind: 'impact' });
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  let count = pulses().length;
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect.poll(pulses).toHaveLength(count + 1);
  expect(pulses().at(-1)).toEqual({ kind: 'notification', type: 'success' });
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  bridge.control.permission = 'denied'; count = pulses().length;
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect.poll(pulses).toHaveLength(count + 1);
  expect(pulses().at(-1)).toEqual({ kind: 'notification', type: 'error' });
  await expect(page.getByRole('alert')).toContainText('Location permission is off');
});
