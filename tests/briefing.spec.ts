import { browserApiFixture as apiFixture } from '../src/test/fixtures';
import { expect, test } from '@playwright/test';
import { asheville, forecastFixture } from '../src/test/fixtures';
import { BRIEFING_TTL, BRIEFING_VERSION } from '../src/lib/briefing';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(place => {
    localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: place, places: [place], preferences: { units: 'imperial', reducedMotion: true } }));
  }, asheville);
  await page.route('**/api/weather?**', route => route.fulfill({ json: apiFixture(forecastFixture(Date.now()), route.request().url()) }));
});
test('automatically shows a concise briefing, reuses it across navigation and respects units', async ({ page }) => {
  const payloads: Record<string, unknown>[] = [];
  await page.route('**/api/weather-briefing', route => {
    const body = route.request().postDataJSON(); payloads.push(body);
    const now = Date.now();
    return route.fulfill({ json: { text: body.units === 'imperial' ? 'Expect a mild afternoon near 72°F, cooling overnight. A light layer will come in handy.' : 'Expect a mild afternoon near 22°C, cooling overnight. A light layer will come in handy.',
      generatedAt: now, windowStart: now, windowEnd: now + 86400000, expiresAt: now + BRIEFING_TTL, version: BRIEFING_VERSION } });
  });
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Weather briefing' });
  await expect(card).toContainText('72°F');
  expect(payloads).toHaveLength(1); expect(JSON.stringify(payloads)).not.toMatch(/latitude|longitude|Asheville|OPENAI_API_KEY/);
  const layout = await page.evaluate(() => ({ card: document.querySelector('.weather-briefing')!.getBoundingClientRect().bottom, hourly: document.querySelector('.hourly-section')!.getBoundingClientRect().top, fits: document.documentElement.scrollWidth <= window.innerWidth }));
  expect(layout.card).toBeLessThanOrEqual(layout.hourly); expect(layout.fits).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Forecast data is sent to OpenAI', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(card).toContainText('72°F'); expect(payloads).toHaveLength(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: '°C / km/h' }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click(); await expect(card).toContainText('22°C'); expect(payloads).toHaveLength(2);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/8bit-briefing-${test.info().project.name}.png`, fullPage: true });
});
test('AI failures leave weather usable and expose an accessible retry', async ({ page }) => {
  await page.route('**/api/weather-briefing', route => route.fulfill({ status: 503, json: { code: 'briefing_unavailable' } }));
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Weather briefing' })).toContainText('unavailable right now');
  await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry briefing' })).toBeDisabled();
  await expect(page.locator('.hour')).toHaveCount(24);
});
test('shows a saved briefing offline and never routes API navigation to the app shell', async ({ page, context }) => {
  await page.route('**/api/weather-briefing', route => {
    const now = Date.now();
    return route.fulfill({ json: { text: 'Mild weather through tomorrow.', generatedAt: now, windowStart: now, windowEnd: now + 86400000, expiresAt: now + BRIEFING_TTL, version: BRIEFING_VERSION } });
  });
  await page.goto('/'); await expect(page.getByRole('region', { name: 'Weather briefing' })).toContainText('Mild weather');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await expect(page.getByRole('region', { name: 'Weather briefing' })).toContainText('Saved briefing');
  await page.unroute('**/api/weather-briefing');
  const shellReturned = await page.evaluate(async () => {
    try { const response = await fetch('/api/weather-briefing', { headers: { Accept: 'text/html' } }); return (await response.text()).includes('<div id="root">'); }
    catch { return false; }
  });
  expect(shellReturned).toBe(false);
});

test('shows a full longer briefing without clipping and retains paragraphs offline', async ({ page, context }) => {
  const text = 'A detailed outlook with a useful recommendation for outdoor plans. '.repeat(27) + '\n\nKeep an indoor option available if storms develop.';
  await page.route('**/api/weather-briefing', route => {
    const now = Date.now();
    return route.fulfill({ json: { text, provider: 'openai', generatedAt: now, windowStart: now, windowEnd: now + 86400000, expiresAt: now + BRIEFING_TTL, version: BRIEFING_VERSION } });
  });
  await page.goto('/');
  const copy = page.locator('.briefing-copy');
  await expect(copy).toHaveText(text);
  expect(await copy.evaluate(element => ({ whitespace: getComputedStyle(element).whiteSpace, fits: element.scrollHeight <= element.clientHeight + 1 }))).toEqual({ whitespace: 'pre-line', fits: true });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await expect(page.getByRole('region', { name: 'Weather briefing' })).toContainText('Saved briefing');
  await expect(copy).toHaveText(text);
});
