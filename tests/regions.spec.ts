import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { asheville, tokyo, forecastFixture } from '../src/test/fixtures';
import { landscapes, landscapeSource } from '../src/lib/landscapes';
import type { Landscape, LandscapeLight } from '../src/lib/landscapes';
import type { Place } from '../src/types';

const regional = (name: string, latitude: number, longitude: number): Place => ({ ...asheville, id: name, name, latitude, longitude });
const places: Record<Landscape, Place> = {
  meadow: tokyo, raleigh: regional('Raleigh', 35.7796, -78.6382),
  beach: regional('Wilmington', 34.2257, -77.9447),
  'coastal-plain': regional('Greenville', 35.6127, -77.3664),
  piedmont: regional('Greensboro', 36.0726, -79.792), 'blue-ridge': asheville,
};
const ids = Object.keys(places) as Landscape[];

async function openScene(page: Page, id: Landscape, light: LandscapeLight = 'day') {
  const now = Date.parse(light === 'night' ? '2026-09-08T03:00:00Z' : '2026-09-07T18:00:00Z');
  await page.clock.setFixedTime(now);
  await page.addInitScript(({ selected, places }) => {
    if (!localStorage.getItem('8bit-weather:v1')) localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected, places, preferences: { units: 'imperial' } }));
  }, { selected: places[id], places: Object.values(places) });
  const data = forecastFixture(now, light === 'overcast' ? 63 : 0, light === 'night' ? 0 : 1);
  data.current.time = now / 1000;
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
  await page.goto('/');
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', id);
  await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  await expect.poll(() => page.locator('.art-layer').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 960))).toBe(true);
  await expect.poll(() => page.locator('[data-art="night"]').evaluate(node => Number(getComputedStyle(node).opacity))).toBe(light === 'night' ? 1 : 0);
}

async function selectPlace(page: Page, id: Landscape) {
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page.locator('.saved-places .place-select').filter({ hasText: places[id].name }).click();
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', id);
}

for (const id of ids) {
  for (const light of ['day', 'overcast', 'night'] as const) {
    test(`${id} ${light}: registered artwork, readable crops, and visible water motion`, async ({ page, browserName }) => {
      await openScene(page, id, light);
      for (const art of ['day', 'overcast', 'night'] as const) await expect(page.locator(`[data-art="${art}"]`)).toHaveAttribute('src', landscapeSource(id, art));
      await expect(page.locator('[data-water-kind]')).toHaveAttribute('data-water-kind', landscapes[id].water.kind);
      if (id === 'beach') {
        await expect(page.locator('.stream,.meadow-fireflies')).toHaveCount(0);
        if (light === 'day') await expect(page.locator('.meadow-birds')).toHaveAttribute('data-bird', 'gull');
      }
      for (const width of [320, 390, 430, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await expect(page.locator('.current-temperature')).toBeVisible();
        await expect(page.getByRole('button', { name: landscapes[id].water.label })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect.poll(() => page.evaluate(() => {
          const stage = document.querySelector('.landscape-stage')!.getBoundingClientRect();
          const scale = stage.width / 960;
          const hub = document.querySelector('.station-hub')!.getBoundingClientRect();
          const indicator = document.querySelector('.station-indicator')!.getBoundingClientRect();
          const scene = document.querySelector('.scenery')!.getBoundingClientRect();
          const controls = [...document.querySelectorAll('.scene-hotspot')].map(node => node.getBoundingClientRect());
          return Math.max(Math.abs(hub.x + hub.width / 2 - stage.x - 195 * scale), Math.abs(hub.y + hub.height / 2 - stage.y - 511 * scale),
            Math.abs(indicator.x + indicator.width / 2 - stage.x - 229 * scale), Math.abs(indicator.y + indicator.height / 2 - stage.y - 579 * scale),
            ...controls.flatMap(r => [Math.max(0, 44 - r.width), Math.max(0, 44 - r.height), Math.max(0, scene.left - r.left), Math.max(0, r.right - scene.right)]));
        })).toBeLessThan(.5);
        await page.locator('.scenery').screenshot({ path: `/tmp/8bit-weather-regions/${browserName}-${id}-${light}-${width}.png`, animations: 'allow' });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => document.querySelector('.landscape')!.getAnimations({ subtree: true }).forEach(animation => animation.pause()));
      const phase = (time: number) => page.evaluate(time => document.querySelectorAll('.stream-current,.stream-eddy,.surf-wave,.surf-shimmer').forEach(node => node.getAnimations().forEach(animation => { animation.currentTime = time; })), time);
      await phase(400);
      const first = await page.locator('.landscape').screenshot({ scale: 'css', animations: 'allow' });
      await phase(1900);
      const second = await page.locator('.landscape').screenshot({ scale: 'css', animations: 'allow' });
      const a = await sharp(first).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const b = await sharp(second).ensureAlpha().raw().toBuffer();
      const geometry = await page.evaluate(() => {
        const area = document.querySelector('.landscape')!.getBoundingClientRect();
        const stage = document.querySelector('.landscape-stage')!.getBoundingClientRect();
        return { left: stage.x - area.x, top: stage.y - area.y, scale: stage.width / 960,
          path: document.querySelector('.stream-waterline,.surf-waterline')!.getAttribute('d')! };
      });
      const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${a.info.width}" height="${a.info.height}"><g transform="translate(${geometry.left} ${geometry.top}) scale(${geometry.scale})"><path d="${geometry.path}" fill="white" stroke="white" stroke-width="3"/></g></svg>`)).ensureAlpha().raw().toBuffer();
      let changed = 0, escaped = 0;
      for (let pixel = 0; pixel < a.data.length; pixel += 4) {
        if (Math.max(...[0, 1, 2].map(channel => Math.abs(a.data[pixel + channel] - b[pixel + channel]))) < 8) continue;
        changed++;
        if (mask[pixel + 3] === 0) escaped++;
      }
      expect(changed).toBeGreaterThan(20);
      expect(escaped).toBe(0);
    });
  }
}

for (const id of ['beach', 'coastal-plain', 'piedmont', 'blue-ridge'] as const) {
  test(`${id}: accessible water discovery and motion controls`, async ({ page }) => {
    await openScene(page, id);
    const water = page.locator('[data-water-kind]');
    const paused = () => water.evaluate(node => node.getAnimations({ subtree: true }).every(animation => animation.playState === 'paused' || animation.playState === 'finished'));
    await expect.poll(paused).toBe(false);
    await page.getByRole('button', { name: landscapes[id].water.label }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.river-discovery')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sound off', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('switch', { name: 'Reduce animation', exact: true }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect.poll(paused).toBe(true);
    await page.getByRole('button', { name: landscapes[id].water.label }).click();
    await expect(page.locator('.river-discovery')).toBeVisible();
    expect(await page.locator('.river-discovery').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('switch', { name: 'Reduce animation', exact: true }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(paused).toBe(true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(paused).toBe(false);
    await page.setViewportSize({ width: 390, height: 400 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(paused).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(paused).toBe(false);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(paused).toBe(true);
  });
}

test('all regional art is precached and saved places switch after an offline reload', async ({ page, browserName, context }) => {
  test.skip(browserName !== 'chromium', 'Service-worker lifecycle is checked in Chromium.');
  await openScene(page, 'beach');
  for (const id of ids) {
    await selectPlace(page, id);
    await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const urls = ids.flatMap(id => (['day', 'overcast', 'night'] as const).map(light => landscapeSource(id, light)));
  await expect.poll(() => page.evaluate(async urls => (await Promise.all(urls.map(url => caches.match(url, { ignoreSearch: true })))).every(Boolean), urls)).toBe(true);
  await page.unroute('https://api.open-meteo.com/**');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', 'blue-ridge');
  for (const id of ids) {
    await selectPlace(page, id);
    await expect.poll(() => page.locator('.art-layer').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth === 960))).toBe(true);
    await expect(page.getByText('You’re offline. Showing your saved forecast.')).toBeVisible();
  }
});
