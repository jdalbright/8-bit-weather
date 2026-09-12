import { apiFixture } from '../src/test/fixtures';
import { expect, test } from '@playwright/test';
import { asheville, fixtureTime, forecastFixture } from '../src/test/fixtures';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(fixtureTime + 1800000);
  await page.addInitScript(place => localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: place, places: [place], preferences: { reducedMotion: true } })), asheville);
  await page.route('**/api/weather?**', route => {
    const forecast = forecastFixture(); forecast.fetchedAt = fixtureTime + 1800000;
    forecast.hourly.weather_code[1] = 65;
    forecast.hourly.temperature_2m[1] = 10;
    forecast.hourly.precipitation_probability[2] = 85;
    return route.fulfill({ json: apiFixture({ ...forecast, hourly: { ...forecast.hourly, wind_speed_10m: forecast.hourly.time.map(() => 30) } }, route.request().url()) });
  });
});

test('keyboard preview, hourly taps, responsive scenery and return to now', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const slider = page.getByRole('slider', { name: 'Forecast preview time' });
  await expect(slider).toHaveValue('0');
  expect((await page.locator('.forecast-time-travel').boundingBox())!.height).toBeLessThanOrEqual(48);
  await slider.focus();
  const initialScroll = await page.evaluate(() => scrollY);
  await slider.press('ArrowRight');
  await expect(page.locator('.forecast-preview-badge')).toHaveText('Forecast preview');
  await expect(page.locator('.scenery')).toHaveAttribute('data-scene', 'rain-day');
  await expect(page.locator('.current-temperature')).toHaveText('50°');
  await expect(page.locator('.feels-like')).toHaveText('Chance of precipitation: 85%');
  expect(await page.evaluate(() => scrollY)).toBe(initialScroll);
  await expect(page.locator('.hour').nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute('aria-pressed', 'false');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const hero = await page.locator('.scenery').boundingBox();
    const readout = await page.locator('.feels-like').boundingBox();
    expect(readout!.y + readout!.height).toBeLessThan(hero!.y + hero!.height);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `/tmp/forecast-preview-${info.project.name}.png`, fullPage: true });
  await page.locator('.hour').nth(9).scrollIntoViewIfNeeded();
  const beforeHourTap = await page.evaluate(() => scrollY);
  await page.locator('.hour').nth(9).click();
  await expect(slider).toHaveValue('9');
  await expect(page.locator('.scenery')).toHaveAttribute('data-phase', 'dusk');
  expect(await page.evaluate(() => scrollY)).toBe(beforeHourTap);
  await expect(page.locator('.scenery')).toHaveAttribute('data-animate', 'false');
  await page.getByRole('button', { name: 'Back to now' }).click();
  await expect(slider).toBeFocused(); await expect(slider).toHaveValue('0');
  await expect(page.locator('.current-temperature')).toHaveText('72°');
  await slider.press('End'); await expect(slider).toHaveValue('23');
  await slider.press('Home'); await expect(slider).toHaveValue('0');
  expect(errors).toEqual([]);
});

test('saved previews retain future lighting, refresh keeps selection, navigation clears it', async ({ page, context }) => {
  await page.goto('/');
  const slider = page.getByRole('slider', { name: 'Forecast preview time' });
  await slider.press('End');
  const selectedTime = await slider.getAttribute('aria-valuetext');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuetext', selectedTime!);
  await context.setOffline(true);
  await expect(page.locator('.forecast-preview-badge')).toHaveText('Saved forecast preview');
  await expect(page.locator('.saved-observation')).toContainText('10:30 AM');
  await page.locator('.hour').nth(15).click();
  await expect(page.locator('.scenery')).toHaveAttribute('data-phase', 'night');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await context.setOffline(false);
  await slider.press('End'); await page.reload();
  await expect(slider).toHaveValue('0');
});

test('touch slider selects a forecast without claiming pull to refresh', async ({ page }, info) => {
  test.skip(info.project.name !== 'webkit', 'Touch input on the iPhone browser profile.');
  await page.goto('/');
  const slider = page.getByRole('slider', { name: 'Forecast preview time' });
  await expect(slider).toBeVisible();
  const rect = (await slider.boundingBox())!;
  await page.touchscreen.tap(rect.x + rect.width * .6, rect.y + rect.height / 2);
  await expect(slider).not.toHaveValue('0');
  await expect(page.locator('.forecast-preview-badge')).toHaveText('Forecast preview');
  await expect(page.getByText('Refreshing…', { exact: true })).toHaveCount(0);
});
