import { expect, test, type Page } from '@playwright/test';
import { installBridge, storageKey } from './bridge';
import { forecastFixture } from '../src/test/fixtures';
import { BRIEFING_VERSION } from '../src/lib/briefing';

async function weather(page: Page) {
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecastFixture(Date.now()) }));
}
async function cloud(page: Page, status = 200) {
  const calls: string[] = [];
  await page.route('https://weather.example/api/weather-briefing', route => {
    calls.push(route.request().postData() ?? '');
    const now = Date.now();
    return route.fulfill({ status, headers: { 'access-control-allow-origin': '*', 'Retry-After': '120' }, json: status !== 200 ? { code: 'unavailable' } : {
      text: 'A mild afternoon gives way to a cooler night. Keep a light layer handy.', generatedAt: now, windowStart: now,
      windowEnd: now + 86400000, expiresAt: now + 900000, version: BRIEFING_VERSION,
    } });
  });
  return calls;
}

test('Apple briefing uses the real proxy, shows attribution and survives offline reload', async ({ page }, info) => {
  const bridge = await installBridge(page); bridge.control.appleAvailable = true;
  await weather(page); const calls = await cloud(page); await page.goto('/');
  await expect(page.locator('.briefing-badge')).toHaveText('Apple Intelligence');
  await expect(page.locator('.briefing-copy')).toHaveText(bridge.control.appleText);
  expect(calls).toHaveLength(0);
  expect(bridge.calls.filter(c => c.plugin === 'AppleBriefing' && c.method === 'generate')).toHaveLength(1);
  await expect.poll(() => bridge.store.has(`${storageKey}:briefings`)).toBe(true);
  await page.locator('.weather-briefing').evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.locator('.weather-briefing').screenshot({ path: `/tmp/${info.project.name}-apple-briefing.png` });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText(/forecast data is automatically sent to OpenAI/)).toBeVisible();
  await expect(page.getByText(/On iOS 27 or later/)).toBeVisible();
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  await page.reload();
  await expect(page.locator('.briefing-badge')).toHaveText('Apple Intelligence');
  expect(bridge.calls.filter(c => c.plugin === 'AppleBriefing' && c.method === 'generate')).toHaveLength(1);
});

test('iOS 26 uses OpenAI without local inference and retains that briefing offline', async ({ page }) => {
  const bridge = await installBridge(page); bridge.control.appleAvailable = true; bridge.control.appleOSMajor = 26;
  await weather(page); const calls = await cloud(page); await page.goto('/');
  await expect(page.locator('.briefing-badge')).toHaveText('OpenAI');
  expect(bridge.calls.filter(c => c.plugin === 'AppleBriefing' && c.method === 'generate')).toHaveLength(0);
  expect(calls).toHaveLength(1);
  await expect.poll(() => bridge.store.has(`${storageKey}:briefings`)).toBe(true);
  await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  await page.reload();
  await expect(page.locator('.briefing-badge')).toHaveText('OpenAI');
  expect(bridge.calls.filter(c => c.plugin === 'AppleBriefing' && c.method === 'generate')).toHaveLength(0);
  expect(calls).toHaveLength(1);
});

for (const failure of ['unavailable', 'GENERATION_FAILED']) {
  test(`falls back to OpenAI when Apple is ${failure}`, async ({ page }) => {
    const bridge = await installBridge(page);
    bridge.control.appleAvailable = failure !== 'unavailable'; bridge.control.appleError = failure;
    await weather(page); const calls = await cloud(page); await page.goto('/');
    await expect(page.locator('.briefing-badge')).toHaveText('OpenAI');
    expect(calls).toHaveLength(1); expect(calls[0]).not.toMatch(/latitude|longitude|Asheville/);
    await expect(page.locator('.briefing-copy')).toContainText('cooler night');
  });
}

test('fresh cached weather can generate locally offline without a saved briefing', async ({ page }) => {
  const bridge = await installBridge(page); bridge.control.appleAvailable = true;
  await weather(page); const calls = await cloud(page); await page.goto('/');
  await expect(page.locator('.briefing-badge')).toHaveText('Apple Intelligence');
  bridge.store.delete(`${storageKey}:briefings`);
  await page.addInitScript(() => { localStorage.clear(); Object.defineProperty(navigator, 'onLine', { get: () => false }); });
  await page.route('https://api.open-meteo.com/**', route => route.abort('internetdisconnected'));
  await page.reload(); await expect(page.locator('.briefing-badge')).toHaveText('Apple Intelligence');
  expect(bridge.calls.filter(c => c.plugin === 'AppleBriefing' && c.method === 'generate')).toHaveLength(2);
  expect(calls).toHaveLength(0);
});

test('navigation cancels local work without cloud fallback and return can generate again', async ({ page }) => {
  const bridge = await installBridge(page); bridge.control.appleAvailable = true; bridge.control.appleHang = true;
  await weather(page); const calls = await cloud(page); await page.goto('/');
  await expect.poll(() => bridge.calls.some(c => c.plugin === 'AppleBriefing' && c.method === 'generate')).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect.poll(() => bridge.calls.some(c => c.plugin === 'AppleBriefing' && c.method === 'cancel')).toBe(true);
  expect(calls).toHaveLength(0); bridge.control.appleHang = false;
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.briefing-badge')).toHaveText('Apple Intelligence'); expect(calls).toHaveLength(0);
});

test('cloud failure leaves the forecast usable and exposes bounded retry', async ({ page }) => {
  await installBridge(page); await weather(page); const calls = await cloud(page, 429); await page.goto('/');
  await expect(page.locator('.briefing-copy')).toContainText('Briefings are busy');
  await expect(page.getByRole('button', { name: 'Retry briefing' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  expect(calls).toHaveLength(1);
});
