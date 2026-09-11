import { expect, test } from '@playwright/test';
import { asheville, tokyo, fixtureTime, forecastFixture } from '../src/test/fixtures';
import { mockRadar } from './support/radar';
import sharp from 'sharp';

// Keep fixture routes authoritative after reload; PWA caching has separate tests.
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(fixtureTime);
  await page.addInitScript(places => localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: places[0], places, preferences: { reducedMotion: false } })), [asheville, tokyo]);
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecastFixture() }));
  await page.route('**/api/weather-briefing', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
});

test('radar loads on demand, renders frames, plays, switches layers, and respects motion preferences', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const loaded: string[] = []; page.on('request', request => loaded.push(request.url()));
  const radar = await mockRadar(page, fixtureTime);
  await page.goto('/'); await expect(page.locator('.current-temperature')).toBeVisible();
  expect(radar.requests).toHaveLength(0);
  expect(loaded.some(url => /radar-(map|vendor|worker)-/.test(url))).toBe(false);
  await page.getByRole('button', { name: 'Radar', exact: true }).click();
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page.getByText('Slide through recent observations, or play the loop.')).toBeVisible();
  await expect(page.locator('.radar-map-warning')).toHaveCount(0);
  // Verify the overlay's actual pixels, not only a successful image download.
  await expect.poll(async () => {
    const { data, info } = await sharp(await page.locator('.radar-map').screenshot()).raw().toBuffer({ resolveWithObject: true });
    let green = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i + 1] > data[i] * 1.4 && data[i + 1] > data[i + 2] * 1.4) green++;
    return green;
  }).toBeGreaterThan(500);
  await expect(page.getByLabel('Precipitation map.', { exact: false })).toBeVisible();
  expect(loaded.some(url => /radar-worker-/.test(url))).toBe(true);
  await expect(page.getByRole('slider', { name: 'Radar observation time' })).toHaveValue('24');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Radar observation time' })).not.toHaveValue('24');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Latest', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Radar observation time' })).toHaveValue('24');
  await page.getByRole('button', { name: 'Precipitation type', exact: true }).click();
  await expect(page.getByText('Slide through recent observations, or play the loop.')).toBeVisible();
  expect(radar.requests.some(url => url.includes('pcpn_typ') && url.includes('GetMap'))).toBe(true);
  await page.getByText('Read the color key').click(); await expect(page.getByText('Warm stratiform rain', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(page.getByRole('slider', { name: 'Radar observation time' })).toBeEnabled();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  const count = radar.requests.length;
  await page.clock.fastForward(125000); expect(radar.requests).toHaveLength(count);
  expect(errors).toEqual([]);
});

test('map gestures, responsive layout, outside coverage and location return work together', async ({ page }, info) => {
  const radar = await mockRadar(page, fixtureTime); await page.goto('/');
  await page.getByRole('button', { name: 'Radar', exact: true }).click();
  await expect(page.getByText('Slide through recent observations, or play the loop.')).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.focus(); await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  await expect(page.getByText('Slide through recent observations, or play the loop.')).toBeVisible();
  const requestedBounds = () => new URL(radar.requests.filter(url => url.includes('GetMap')).at(-1)!).searchParams.get('bbox')!.split(',').map(Number);
  const beforeRotation = requestedBounds();
  await canvas.focus(); await page.keyboard.press('Shift+ArrowRight'); await page.keyboard.press('Shift+ArrowUp');
  // Allow MapLibre's 300 ms keyboard easing and 150 ms viewport settle to finish.
  await page.waitForTimeout(600);
  // Reprojection can change sub-millimeter rounding; orientation must stay fixed.
  requestedBounds().forEach((coordinate, index) => expect(coordinate).toBeCloseTo(beforeRotation[index], 2));
  await expect(page.locator('.pull-refresh-feedback')).toHaveCount(0);
  await page.getByRole('button', { name: 'Recenter on Asheville' }).click();
  await expect(page.getByText('Slide through recent observations, or play the loop.')).toBeVisible();
  await page.screenshot({ path: `/tmp/8bit-radar-synthetic-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Change radar location, Asheville' }).click();
  await page.getByRole('button', { name: /Tokyo.*Japan/ }).click();
  await expect(page.getByRole('button', { name: 'Radar', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Outside U.S. radar coverage' })).toBeVisible();
});

test('failed map download disables playback and offers full reload recovery', async ({ page }) => {
  await mockRadar(page, fixtureTime);
  await page.route('**/radar-map-*.js', route => route.fulfill({ status: 503, body: 'Temporarily unavailable', headers: { 'Cache-Control': 'no-store' } }));
  await page.goto('/'); await page.getByRole('button', { name: 'Radar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Map couldn’t load' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(page.locator('.radar-load-status')).toContainText('Reload the app');
  await expect(page.getByRole('button', { name: 'Retry imagery' })).toHaveCount(0);
  await page.unroute('**/radar-map-*.js');
  await page.getByRole('button', { name: 'Reload app' }).click();
  await expect(page.locator('.current-temperature')).toBeVisible();
  await page.getByRole('button', { name: 'Radar', exact: true }).click();
  await expect(page.getByText('Slide through recent observations, or play the loop.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
});

test('graphics context loss stops imagery work until the map is restarted', async ({ page }) => {
  const radar = await mockRadar(page, fixtureTime);
  await page.goto('/'); await page.getByRole('button', { name: 'Radar', exact: true }).click();
  for (const playing of [false, true]) {
    await expect(page.getByText('Slide through recent observations, or play the loop.')).toBeVisible();
    if (playing) await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.locator('.maplibregl-canvas').evaluate(canvas => {
      const extension = (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('Test requires WEBGL_lose_context');
      extension.loseContext();
    });
    await expect(page.locator('.radar-load-status')).toContainText('The map was interrupted');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled();
    const requests = radar.requests.length;
    await page.getByRole('slider', { name: 'Radar observation time' }).focus(); await page.keyboard.press('Home');
    await page.waitForTimeout(800);
    expect(radar.requests).toHaveLength(requests);
    await expect(page.locator('.radar-load-status')).toContainText('The map was interrupted');
    await page.getByRole('button', { name: 'Retry imagery' }).click();
  }
  await expect(page.getByText('Slide through recent observations, or play the loop.')).toBeVisible();
});

test('image errors, delayed observations and offline state never look like dry weather', async ({ page, context }) => {
  const radar = await mockRadar(page, fixtureTime); radar.delayed = true; radar.imageError = true;
  // Finish the initial 150 ms viewport settle before surfacing the injected error.
  radar.imageDelay = 350;
  await page.goto('/'); await page.getByRole('button', { name: 'Radar', exact: true }).click();
  await expect(page.getByText('Data delayed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry imagery' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  radar.imageError = false;
  await page.getByRole('button', { name: 'Retry imagery' }).click();
  await expect(page.getByText(/Waiting for updated data/)).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByRole('heading', { name: 'Radar needs a connection' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText(/Waiting for updated data/)).toBeVisible();
});

test('scrubbing keeps the shown timestamp until the replacement image loads and falls back to UTC without a forecast', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', route => route.abort());
  const radar = await mockRadar(page, fixtureTime);
  await page.goto('/'); await page.getByRole('button', { name: 'Radar', exact: true }).click();
  await expect(page.getByText('Slide through recent observations, or play the loop.')).toBeVisible();
  const shown = page.locator('.radar-time-heading time');
  await expect(shown).toContainText('UTC');
  const latest = await shown.getAttribute('datetime');
  radar.imageDelay = 1000;
  const slider = page.getByRole('slider', { name: 'Radar observation time' });
  await slider.focus(); await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  await expect(page.locator('.radar-load-status')).toContainText('Loading');
  await expect(shown).toHaveAttribute('datetime', latest!);
  await expect(page.getByText('Slide through recent observations, or play the loop.')).toBeVisible();
  await expect(shown).not.toHaveAttribute('datetime', latest!);
});
