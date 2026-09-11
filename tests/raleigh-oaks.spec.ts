import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { asheville, forecastFixture } from '../src/test/fixtures';

const assets = ['left', 'right'].flatMap(side => ['day', 'overcast', 'night'].map(light => `/art/raleigh-oaks/oak-${side}-${light}.webp`));
async function open(page: Page, code = 0, night = false) {
  const now = Date.parse(night ? '2026-09-11T06:00:00Z' : '2026-09-11T18:00:00Z');
  await page.clock.setFixedTime(now);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    const place = { id: 'raleigh', name: 'Raleigh', region: 'North Carolina', country: 'United States', latitude: 35.7796, longitude: -78.6382, source: 'search' };
    localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: place, places: [place], preferences: { units: 'imperial', reducedMotion: false } }));
  });
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecastFixture(now, code, night ? 0 : 1) }));
  await page.route('**/api/weather-briefing', route => route.fulfill({ status: 503, json: { code: 'unavailable' } }));
  await page.goto('/');
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', 'raleigh');
  await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  await page.evaluate(async assets => Promise.all(assets.map(src => { const image = new Image(); image.src = src; return image.decode(); })), assets);
}

test('oak strips have genuine transparency, separate frame poses, and fixed roots', async () => {
  for (const asset of assets) {
    const image = sharp(`public${asset}`);
    const metadata = await image.metadata();
    expect(metadata.hasAlpha).toBe(true);
    expect([metadata.width, metadata.height]).toEqual([1920, 320]);
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0, opaque = 0, moving = 0, rootsChanged = 0, rootAlphaChanged = 0;
    for (let y = 0; y < 320; y++) for (let x = 0; x < 240; x++) {
      const p = (y * info.width + x) * 4, q = (y * info.width + x + 240 * 2) * 4;
      if (!data[p + 3]) transparent++; else opaque++;
      const changed = Math.max(...[0, 1, 2, 3].map(c => Math.abs(data[p + c] - data[q + c]))) > 12;
      if (changed && (data[p + 3] || data[q + 3])) { if (y < 270) moving++; else rootsChanged++; }
      if (y >= 270 && data[p + 3] !== data[q + 3]) rootAlphaChanged++;
    }
    expect(transparent).toBeGreaterThan(10000); expect(opaque).toBeGreaterThan(10000);
    expect(moving).toBeGreaterThan(1000);
    expect(rootAlphaChanged).toBe(0);
    // Lossy WebP color blocks can vary slightly; root geometry/alpha must remain exact.
    expect(rootsChanged).toBeLessThan(240 * 50 * .02);
  }
});

test('neutral oak masters preserve the original painting colors', async () => {
  for (const light of ['day', 'overcast', 'night']) {
    const original = await sharp(`docs/design/raleigh-v1/scene-raleigh-${light}-v1.webp`).removeAlpha().raw().toBuffer();
    for (const [side, left] of [['left', -8], ['right', 728]] as const) {
      const master = await sharp(`docs/design/raleigh-oaks-v1/sources/oak-${side}-${light}.png`).raw().toBuffer();
      let mismatches = 0;
      for (let y = 0; y < 320; y++) for (let x = 0; x < 240; x++) {
        const p = (y * 240 + x) * 4;
        if (!master[p + 3]) continue;
        const q = ((y + 280) * 960 + left + x) * 3;
        if ([0, 1, 2].some(c => master[p + c] !== original[q + c])) mismatches++;
      }
      expect(mismatches).toBe(0);
    }
  }
});

test('oak sprite frames change in place and respect motion and visibility', async ({ page }) => {
  await open(page);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.locator('.landscape').evaluate(n => n.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 4000; }));
  const oak = page.locator('.oak-left');
  await oak.locator('.oak-frames').evaluateAll(nodes => nodes.forEach(n => n.getAnimations().forEach(a => { a.currentTime = 0; })));
  const before = await oak.boundingBox();
  // An edge tree is intentionally clipped. Locator screenshots auto-scroll its
  // overflow container in Chromium; capture its visible viewport intersection instead.
  const clip = { x: Math.max(0, before!.x), y: before!.y, width: before!.width + Math.min(0, before!.x), height: before!.height };
  const first = await page.screenshot({ clip, animations: 'allow', scale: 'css' });
  await oak.locator('.oak-frames').evaluateAll(nodes => nodes.forEach(n => n.getAnimations().forEach(a => { a.currentTime = Number(a.effect!.getTiming().duration) / 4; })));
  const second = await page.screenshot({ clip, animations: 'allow', scale: 'css' });
  expect(before).toEqual(await oak.boundingBox());
  expect(first.equals(second)).toBe(false);
  await page.reload();
  const running = () => page.locator('.raleigh-oaks').evaluate(n => n.getAnimations({ subtree: true }).some(a => a.playState === 'running'));
  await expect.poll(running).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect.poll(running).toBe(false);
  await expect(page.locator('.oak-left .oak-frames').first()).toHaveCSS('background-position', '0px 0px');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await expect.poll(running).toBe(true);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(running).toBe(false);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(running).toBe(true);
  await page.setViewportSize({ width: 390, height: 400 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(running).toBe(false);
  expect(errors).toEqual([]);
});

for (const [light, code, night] of [['day', 0, false], ['overcast', 3, false], ['night', 0, true]] as const) {
  test(`oak ${light} lighting stays registered at mobile and desktop sizes`, async ({ page, browserName }) => {
    await open(page, code, night);
    await expect(page.locator(`[data-oak-light='${light}']`).first()).toHaveCSS('opacity', '1');
    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator('.current-temperature')).toBeVisible();
      await page.getByRole('button', { name: 'Blink the weather station light' }).click();
      await expect(page.locator('.indicator-active')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator('.scenery').screenshot({ path: `/tmp/raleigh-oaks/${browserName}-${light}-${width}.png`, animations: 'allow', scale: 'css' });
    }
  });
}

test('oak assets work offline and do not appear in another region', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service-worker lifecycle is checked in Chromium.');
  await open(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(async assets => (await Promise.all(assets.map(a => caches.match(a, { ignoreSearch: true })))).every(Boolean), assets)).toBe(true);
  await context.setOffline(true); await page.reload();
  expect(await page.evaluate(async assets => (await Promise.all(assets.map(async a => (await fetch(a)).ok))).every(Boolean), assets)).toBe(true);
  await context.setOffline(false);
  await page.addInitScript(place => localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: place, places: [place], preferences: { units: 'imperial' } })), asheville);
  await page.reload(); await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', 'blue-ridge');
  await expect(page.locator('.raleigh-oaks')).toHaveCount(0);
});
