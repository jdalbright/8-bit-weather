import { browserApiFixture as apiFixture } from '../src/test/fixtures';
import { expect, test } from '@playwright/test';
import { asheville, forecastFixture } from '../src/test/fixtures';

for (const width of [320, 390, 480]) {
  test(`current conditions stay aligned and usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.addInitScript(place => localStorage.setItem('8bit-weather:v1', JSON.stringify({
      preferences: { units: 'imperial', reducedMotion: true }, places: [place], selected: place,
    })), asheville);
    await page.route('**/api/weather?**', route => route.fulfill({ json: apiFixture(forecastFixture(Date.now()), route.request().url()) }));
    await page.goto('/');
    const grid = page.locator('.current-stats');
    await expect(grid).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await grid.screenshot({ path: testInfo.outputPath('conditions.png') });
    await expect(grid.getByText('Precip chance', { exact: true })).toBeVisible();
    await expect(grid.getByText('This hour', { exact: true })).toBeVisible();
    await expect(grid.locator('button')).toHaveCount(1);
    const uv = grid.getByRole('button', { name: /UV index/ });
    await expect(uv.getByText('Details', { exact: true })).toBeVisible();
    const metrics = await grid.evaluate(element => {
      const cells = [...element.children].map(cell => cell.getBoundingClientRect());
      return { widths: cells.map(cell => cell.width), heights: cells.map(cell => cell.height),
        overflow: element.scrollWidth > element.clientWidth,
        labels: [...element.querySelectorAll('dt > span:not(.sr-only), .uv-stat-label')].map(label => {
          const rect = label.getBoundingClientRect();
          return { left: rect.left, top: rect.top };
        }),
        icons: [...element.children].map(cell => cell.querySelector('svg')!.getBoundingClientRect().left),
        verticalOffsets: [...element.children].map(cell => {
          const bounds = cell.getBoundingClientRect();
          const label = cell.querySelector('dt > span:not(.sr-only), .uv-stat-label')!.getBoundingClientRect();
          const content = (cell.querySelector('.uv-stat-copy') ?? cell.querySelector('dd'))!.getBoundingClientRect();
          return Math.abs((label.top + content.bottom) / 2 - (bounds.top + bounds.bottom) / 2);
        }),
        centerOffsets: [...element.children].map(cell => {
          const bounds = cell.getBoundingClientRect();
          const icon = cell.querySelector('svg')!.getBoundingClientRect();
          const copy = cell.querySelector('.uv-stat-copy, dd')!;
          const reading = (cell.querySelector('.uv-stat-copy') ?? copy).getBoundingClientRect();
          return Math.abs((icon.left + reading.right) / 2 - (bounds.left + bounds.right) / 2);
        }) };
    });
    expect(metrics.overflow).toBe(false);
    expect(Math.max(...metrics.widths) - Math.min(...metrics.widths)).toBeLessThanOrEqual(1);
    expect(metrics.heights.every(height => height >= 44 && height <= 72)).toBe(true);
    expect(metrics.centerOffsets.every(offset => offset <= 1)).toBe(true);
    expect(metrics.verticalOffsets.every(offset => offset <= 1)).toBe(true);
    expect(Math.abs(metrics.labels[0].left - metrics.labels[2].left)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.labels[1].left - metrics.labels[3].left)).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.icons[0] - metrics.icons[2])).toBeLessThanOrEqual(1);
    expect(Math.abs(metrics.icons[1] - metrics.icons[3])).toBeLessThanOrEqual(1);
    await uv.focus();
    await page.keyboard.press('Enter');
    await expect(uv).toHaveAttribute('aria-expanded', 'true');
    await expect(uv.getByText('Hide details', { exact: true })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'UV forecast hour' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(uv).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('slider', { name: 'UV forecast hour' })).toHaveCount(0);
    await expect(page.locator('.uv-disclosure')).toHaveAttribute('inert', '');
    await page.keyboard.press('Tab');
    await expect(page.locator('.uv-disclosure :focus')).toHaveCount(0);
    await uv.click();
    await expect(uv).toHaveAttribute('aria-expanded', 'true');
    await uv.click();
    // CSS zoom exercises enlarged content/reflow in both browser engines.
    await page.setViewportSize({ width: width * 2, height: 1600 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await grid.screenshot({ path: testInfo.outputPath('conditions-200-percent.png') });
    expect(await grid.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}

for (const scenario of [{ name: 'very-high', uv: 9, label: 'Very high' }, { name: 'missing', uv: null, label: 'Unavailable' }]) {
  test(`current conditions fit ${scenario.name} readings on a small touch screen`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.addInitScript(place => localStorage.setItem('8bit-weather:v1', JSON.stringify({
      preferences: { units: 'metric', reducedMotion: true }, places: [place], selected: place,
    })), asheville);
    await page.route('**/api/weather?**', route => {
      const raw = forecastFixture(Date.now());
      return route.fulfill({ json: apiFixture({ ...raw,
        current: { ...raw.current, uv_index: scenario.uv, wind_speed_10m: scenario.uv === null ? null : 160, relative_humidity_2m: scenario.uv === null ? null : 100 },
        hourly: { ...raw.hourly, uv_index: raw.hourly.time.map(() => scenario.uv) },
      }, route.request().url()) });
    });
    await page.goto('/');
    const grid = page.locator('.current-stats');
    const uv = grid.getByRole('button', { name: /UV index/ });
    await expect(uv.getByText(scenario.label, { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await grid.screenshot({ path: testInfo.outputPath('conditions.png') });
    expect(await grid.evaluate(element => [...element.querySelectorAll('dd, button, .uv-stat-copy')].every(child => child.scrollWidth <= child.clientWidth))).toBe(true);
    if (testInfo.project.name === 'webkit') await uv.tap();
    else await uv.click();
    await expect(uv).toHaveAttribute('aria-expanded', 'true');
    await grid.screenshot({ path: testInfo.outputPath('conditions-expanded.png') });
  });
}


for (const source of ['search', 'gps'] as const) {
  test(`dry Raleigh ${source} conditions do not show rain in the headline or scenery`, async ({ page }, testInfo) => {
    const place = { id: source === 'gps' ? 'current-location' : 'raleigh', name: source === 'gps' ? 'Current location' : 'Raleigh',
      latitude: 35.7796, longitude: -78.6382, region: 'North Carolina', source };
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(place => localStorage.setItem('8bit-weather:v1', JSON.stringify({
      preferences: { reducedMotion: true }, places: [place], selected: place,
    })), place);
    let wet = false;
    await page.route('**/api/weather?**', route => {
      const raw = forecastFixture(Date.now(), 61);
      return route.fulfill({ json: apiFixture({ ...raw, current: { ...raw.current, rain: wet ? 0.4 : 0, showers: 0, cloud_cover: 100 } }, route.request().url()) });
    });
    await page.goto('/');
    await expect(page.locator('.condition')).toHaveText('Overcast');
    await expect(page.locator('.current-weather .saved-observation')).toContainText('As of');
    await expect(page.locator('.forecast-scene .rainfall')).toHaveCount(0);
    await expect(page.locator('.hour').first()).toHaveAccessibleName(/Now, Overcast/);
    // Upcoming rain is still allowed in the forecast, without becoming rain now.
    await expect(page.locator('.hour').nth(1)).toHaveAccessibleName(/Light rain/);
    await page.screenshot({ path: testInfo.outputPath(`raleigh-${source}-dry.png`) });
    wet = true;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.condition')).toHaveText('Light rain');
    await expect(page.locator('.forecast-scene .rainfall')).toHaveCount(1);
    wet = false;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.locator('.condition')).toHaveText('Overcast');
    await expect(page.locator('.forecast-scene .rainfall')).toHaveCount(0);
  });
}
