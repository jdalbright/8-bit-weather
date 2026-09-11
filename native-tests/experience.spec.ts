import { expect, test } from '@playwright/test';
import { forecastFixture } from '../src/test/fixtures';
import { installBridge, savedState, storageKey } from './bridge';

async function setup(page: import('@playwright/test').Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const bridge = await installBridge(page, { [storageKey]: JSON.stringify({ ...savedState, preferences: { ...savedState.preferences, reducedMotion: false } }) });
  await page.route('https://api.open-meteo.com/**', route => { const forecast = forecastFixture(Date.now()); forecast.minutely_15.rain.fill(0.2); return route.fulfill({ json: forecast, headers: { 'access-control-allow-origin': '*' } }); });
  return bridge;
}

test('haptics are deliberate, disabled independently, and persist after relaunch', async ({ page }) => {
  const bridge = await setup(page);
  const pulses = () => bridge.calls.filter(call => call.plugin === 'NativeExperience' && call.method === 'triggerHaptic');
  await page.goto('/'); await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  expect(pulses()).toHaveLength(0);
  await page.getByRole('button', { name: 'Today', exact: true }).click(); expect(pulses()).toHaveLength(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => pulses().length).toBe(1); expect(pulses()[0].options?.kind).toBe('impact');
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.evaluate(() => window.__emitNative('refresh', { requestId: 42 }));
  await expect.poll(() => pulses().length).toBe(2);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect.poll(() => pulses().length).toBe(3);
  const toggle = page.getByRole('switch', { name: 'Haptic feedback' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true'); await toggle.click();
  await expect.poll(() => JSON.parse(bridge.store.get(storageKey)!).preferences.haptics).toBe(false);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); expect(pulses()).toHaveLength(3);
  await page.reload(); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false'); expect(pulses()).toHaveLength(3);
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
