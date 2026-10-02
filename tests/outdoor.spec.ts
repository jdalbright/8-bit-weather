import { expect, test } from '@playwright/test';
import { asheville } from '../src/test/fixtures';
import { mockOutdoor } from './support/outdoor';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(place => localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: place, places: [place], preferences: { units: 'imperial', reducedMotion: true, bestTimeOutside: true } })), asheville);
});

test('generates only on request and previews tomorrow, fits mobile and desktop, and returns to now', async ({ page }, info) => {
  const state = await mockOutdoor(page);
  await page.goto('/');
  await expect(page).toHaveTitle('Asheville · 8-Bit Weather');
  await expect(page.locator('.briefing-copy')).toContainText('A mild forecast');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '72° Fahrenheit' })).toBeVisible();
  await page.screenshot({ path: `/tmp/8bit-outside-${info.project.name}-initial.png` });
  const card = page.getByRole('region', { name: 'Best time outside' });
  await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeVisible();
  expect(state.outdoorRequests).toBe(0);
  for (const width of [320, 390, 485, 1024]) {
    await page.setViewportSize({ width, height: 813 });
    expect((await card.boundingBox())!.height).toBeLessThan(110);
    await expect(card.getByRole('button')).toHaveCount(3);
    expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.screenshot({ path: `/tmp/8bit-outdoor-compact-${info.project.name}-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await card.evaluate(element => element.nextElementSibling?.classList.contains('weather-briefing'))).toBe(true);
  const counts = [state.weatherRequests, state.briefingRequests];
  const current = await page.locator('.current-stats').innerText();
  await card.getByRole('button', { name: 'Tomorrow', exact: true }).click();
  expect(state.outdoorRequests).toBe(0);
  // Model completion happens after the parent's clock sample, as it does live.
  state.outdoorGeneratedAt += 2000;
  await page.clock.setFixedTime(state.outdoorGeneratedAt);
  const generate = card.getByRole('button', { name: 'Ask OpenAI' });
  if (info.project.name === 'webkit') await generate.tap();
  else { await generate.focus(); await generate.press('Enter'); }
  await expect(card).toContainText('12:00 PM–1:00 PM');
  expect(state.outdoorRequests).toBe(1);
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(card.getByRole('button', { name: 'Preview this hour' })).toBeInViewport();
    const previewBounds = (await card.getByRole('button', { name: 'Preview this hour' }).boundingBox())!;
    expect(previewBounds.y + previewBounds.height).toBeLessThanOrEqual((await page.getByRole('navigation').boundingBox())!.y);
    for (const filter of await card.getByRole('button').all()) expect((await filter.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `/tmp/8bit-outside-${info.project.name}-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const preview = card.getByRole('button', { name: 'Preview this hour' });
  if (info.project.name === 'webkit') await preview.tap();
  else { await preview.focus(); await preview.press('Enter'); }
  const slider = page.getByRole('slider', { name: 'Forecast preview time' });
  await expect(slider).toHaveValue('26'); await expect(slider).toBeFocused();
  await expect(slider).toHaveAttribute('aria-valuetext', /Tue, Sep 8.*12:00 PM/);
  await expect(page.locator('.scenery')).toBeInViewport();
  await expect(page.locator('.scenery')).toHaveAttribute('data-animate', 'false');
  await expect(page.locator('.hour')).toHaveCount(48);
  await expect(page.locator('.hour').nth(26)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.current-stats').innerText()).toBe(current);
  await expect(page.locator('.briefing-copy')).toContainText('A mild forecast');
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute('aria-pressed', 'false');
  expect([state.weatherRequests, state.briefingRequests]).toEqual(counts);
  expect(state.outdoorRequests).toBe(1);
  await page.getByRole('button', { name: 'Back to now' }).click();
  await expect(slider).toHaveValue('0');
  await expect(page.locator('.forecast-scene')).toHaveAttribute('data-preview', 'false');
  expect(state.errors).toEqual([]);
});

// A controlled worker can bypass WebKit's API routing; this test isolates the
// in-session offline recommendation flow. PWA caching is covered by briefing tests.
test.describe('offline recommendation session', () => {
  test.use({ serviceWorkers: 'block' });
  test('keeps a generated result offline and resets filters after leaving Today', async ({ page, context }) => {
    const state = await mockOutdoor(page);
    await page.goto('/');
    const card = page.getByRole('region', { name: 'Best time outside' });
    await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeVisible();
    await expect(page.locator('.briefing-copy')).toContainText('A mild forecast');
    await card.getByRole('button', { name: 'Tomorrow', exact: true }).click();
    await card.getByRole('button', { name: 'Ask OpenAI' }).click();
    await expect(card).toContainText('12:00 PM–1:00 PM');
    await context.setOffline(true);
    await expect(card).toContainText('Saved AI recommendation');
    await card.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(card).toContainText('Connect to generate');
    await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeDisabled();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: '°C / km/h' }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeEnabled();
    await card.getByRole('button', { name: 'Ask OpenAI' }).click();
    await expect(card.locator('.outdoor-conditions')).toContainText('22°');
    await expect(card.locator('.outdoor-conditions')).toContainText('8 km/h');
    expect(state.errors.filter(error => error !== 'Service Worker registration blocked by Playwright')).toEqual([]);
  });
});

for (const scenario of ['poor weather', 'missing measurements'] as const) test(`shows an honest empty state for ${scenario}`, async ({ page }) => {
  const state = await mockOutdoor(page);
  if (scenario === 'poor weather') state.forecast.hourly.weather_code.fill(95);
  else state.forecast.hourly.wind_speed_10m = [];
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Best time outside' });
  await expect(card).toContainText(scenario === 'poor weather' ? 'No comfortable window' : 'Forecast details unavailable');
  await expect(card.getByRole('button', { name: 'Preview this hour' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeDisabled();
  expect(state.outdoorRequests).toBe(0);
});

test('keeps Ask OpenAI available on a hot day and previews the best available hour', async ({ page }, info) => {
  const state = await mockOutdoor(page);
  state.forecast.hourly.temperature_2m.fill(32);
  state.outdoorText = 'The light wind is a plus, though the heat remains a drawback.';
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Best time outside' });
  await expect(card).toContainText('No hour meets every comfort preference');
  await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeEnabled();
  expect(state.outdoorRequests).toBe(0);
  await card.getByRole('button', { name: 'Ask OpenAI' }).click();
  await expect(card).toContainText('Best available hour');
  await expect(card).toContainText('heat remains a drawback');
  await expect(card).toContainText('90°');
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await card.scrollIntoViewIfNeeded();
    expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(card.getByRole('button', { name: 'Preview this hour' })).toBeInViewport();
    await page.screenshot({ path: `/tmp/8bit-outdoor-hot-${info.project.name}-${width}.png` });
  }
  await card.getByRole('button', { name: 'Preview this hour' }).click();
  await expect(page.getByRole('slider', { name: 'Forecast preview time' })).toHaveValue('1');
  expect(state.outdoorRequests).toBe(1);
  expect(state.errors).toEqual([]);
});
