import { expect, test } from '@playwright/test';
import { forecastFixture } from '../src/test/fixtures';
import { installBridge, savedState, storageKey } from './bridge';
import { checkInteractionMotion } from '../tests/support/interaction-motion';

test('iOS leaves edges to UIKit and keeps the UV disclosure animation', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installBridge(page, { [storageKey]: JSON.stringify({ ...savedState, preferences: { ...savedState.preferences, reducedMotion: false } }) });
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecastFixture(Date.now()), headers: { 'access-control-allow-origin': '*' } }));
  await checkInteractionMotion(page, `8bit-motion-${testInfo.project.name}`, true);
});

test('native pull-to-refresh finishes after fetching and detaches when leaving Today', async ({ page }) => {
  const bridge = await installBridge(page);
  let requests = 0;
  await page.route('https://api.open-meteo.com/**', route => {
    requests++;
    return route.fulfill({ json: forecastFixture(Date.now()), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  const configurations = () => bridge.calls.filter(call => call.plugin === 'NativeScroll' && call.method === 'configure');
  await expect.poll(() => configurations().at(-1)?.options?.enabled).toBe(true);
  const before = requests;
  await page.evaluate(() => window.__emitNative('refresh', { requestId: 7 }));
  await expect.poll(() => requests).toBe(before + 1);
  await expect.poll(() => bridge.calls.some(call => call.plugin === 'NativeScroll' && call.method === 'finish' && call.options?.requestId === 7)).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect.poll(() => configurations().at(-1)?.options?.visible).toBe(false);
  await page.evaluate(() => window.__emitNative('refresh', { requestId: 8 }));
  expect(requests).toBe(before + 1);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect.poll(() => configurations().at(-1)?.options?.enabled).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  await expect.poll(() => configurations().at(-1)?.options?.enabled).toBe(false);
  await page.evaluate(() => window.__emitNative('refresh', { requestId: 9 }));
  await expect.poll(() => bridge.calls.some(call => call.method === 'finish' && call.options?.requestId === 9)).toBe(true);
  expect(requests).toBe(before + 1);
});
