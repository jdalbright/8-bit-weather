import { expect, test } from '@playwright/test';
import { asheville, fixtureTime, forecastFixture } from '../src/test/fixtures';

test('sunrise and sunset stay readable across screen sizes, enlarged text, UV details, and offline mode', async ({ page, context }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(fixtureTime);
  await page.addInitScript(place => {
    localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: place, places: [place], preferences: { reducedMotion: true } }));
  }, asheville);
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecastFixture() }));
  await page.route('**/api/weather-briefing', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
  await page.goto('/');
  const row = page.getByLabel("Today's sunrise and sunset");
  await expect(row.getByText('7:00 AM')).toBeVisible();
  await expect(row.getByText('7:00 PM')).toBeVisible();
  expect(await row.evaluate(element => element.previousElementSibling?.classList.contains('hourly-section')
    && element.nextElementSibling?.classList.contains('daily-section'))).toBe(true);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await row.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await row.locator('dd').evaluateAll(readings => readings.every(reading => reading.scrollWidth <= reading.clientWidth))).toBe(true);
    if (width === 390 && testInfo.project.name === 'chromium') {
      await page.screenshot({ path: '/tmp/8bit-weather-sun-section-390.png', fullPage: true });
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await row.locator('dt, dd').evaluateAll(readings => readings.every(reading => reading.scrollWidth <= reading.clientWidth))).toBe(true);
  await expect(row.getByText('7:00 AM')).toBeVisible();
  await expect(row.getByText('7:00 PM')).toBeVisible();
  if (testInfo.project.name === 'chromium') await row.screenshot({ path: '/tmp/8bit-weather-sun-section-large-text.png' });
  await page.getByRole('button', { name: /UV index .*show details/ }).click();
  await expect(page.getByRole('region', { name: 'A little sun sense' })).toBeVisible();
  await expect(row).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText('You’re offline. Showing your saved forecast.', { exact: true })).toBeVisible();
  await expect(row.getByText('7:00 AM')).toBeVisible();
  await expect(row.getByText('7:00 PM')).toBeVisible();
  expect(errors).toEqual([]);
});
