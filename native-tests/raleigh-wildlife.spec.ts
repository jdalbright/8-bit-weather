import { expect, test } from '@playwright/test';
import { forecastFixture, asheville } from '../src/test/fixtures';
import { installBridge, savedState, storageKey } from './bridge';

test('Raleigh sprites use the native power and lifecycle signals and bundled artwork', async ({ page }) => {
  const now = Date.parse('2026-09-11T18:00:00Z');
  await page.clock.setFixedTime(now);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const raleigh = { ...asheville, id: 'raleigh', name: 'Raleigh', latitude: 35.7796, longitude: -78.6382 };
  const bridge = await installBridge(page, { [storageKey]: JSON.stringify({ ...savedState, selected: raleigh, places: [raleigh], preferences: { ...savedState.preferences, reducedMotion: false } }) });
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecastFixture(now), headers: { 'access-control-allow-origin': '*' } }));
  bridge.control.lowPowerMode = true;
  await page.goto('/');
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', 'raleigh');
  await expect(page.locator('.raleigh-resting-bird')).toBeVisible();
  await expect(page.locator('.raleigh-leaves')).toBeHidden();
  expect(await page.locator('.raleigh-wildlife').evaluate(n => n.getAnimations({ subtree: true }).some(a => a.playState === 'running'))).toBe(false);
  expect(await page.evaluate(async () => {
    await Promise.all(['cardinal.png', 'blue-jay.png', 'leaves.png'].map(name => { const image = new Image(); image.src = `/art/raleigh-wildlife/${name}`; return image.decode(); }));
    return true;
  })).toBe(true);
  bridge.control.lowPowerMode = false;
  await page.evaluate(() => window.__emitNative('powerStateChanged', { lowPowerMode: false, thermalState: 'nominal' }));
  const moving = () => page.locator('.raleigh-wildlife').evaluate(n => n.getAnimations({ subtree: true }).some(a => a.playState === 'running'));
  await expect.poll(moving).toBe(true);
  await page.evaluate(() => window.__emitNative('appStateChange', { isActive: false }));
  await expect.poll(moving).toBe(false);
  await page.evaluate(() => window.__emitNative('appStateChange', { isActive: true }));
  await expect.poll(moving).toBe(true);
  await page.evaluate(() => window.__emitNative('powerStateChanged', { lowPowerMode: false, thermalState: 'serious' }));
  await expect(page.locator('.raleigh-resting-bird')).toBeVisible(); await expect.poll(moving).toBe(false);
});
