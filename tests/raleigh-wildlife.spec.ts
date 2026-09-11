import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { asheville, forecastFixture } from '../src/test/fixtures';

const raleigh = { ...asheville, id: 'raleigh', name: 'Raleigh', latitude: 35.7796, longitude: -78.6382 };
const assets = ['cardinal.png', 'blue-jay.png', 'leaves.png', 'credits.txt'].map(name => `/art/raleigh-wildlife/${name}`);

async function openRaleigh(page: Page, { code = 0, night = false, wind = 8, place = raleigh } = {}) {
  const now = Date.parse(night ? '2026-09-11T06:00:00Z' : '2026-09-11T18:00:00Z');
  await page.clock.setFixedTime(now);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(place => {
    if (!localStorage.getItem('8bit-weather:v1')) localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: place, places: [place], preferences: { units: 'imperial', reducedMotion: false } }));
  }, place);
  const forecast = forecastFixture(now, code, night ? 0 : 1);
  forecast.current.wind_speed_10m = wind;
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: forecast }));
  await page.route('**/api/weather-briefing', route => route.fulfill({ status: 503, json: { code: 'unavailable' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', place.id === 'raleigh' ? 'raleigh' : 'blue-ridge');
  await expect.poll(() => page.locator('.art-layer').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete))).toBe(true);
  await page.evaluate(async () => {
    await Promise.all(['cardinal.png', 'blue-jay.png', 'leaves.png'].map(name => {
      const image = new Image(); image.src = `/art/raleigh-wildlife/${name}`; return image.decode();
    }));
  });
}

async function freezeScene(page: Page) {
  await page.evaluate(() => {
    document.querySelector('.landscape')!.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = 4000; });
    // Set both flight timelines to the same scene time, preserving the 20s delay.
    document.querySelectorAll('.raleigh-bird-flight').forEach(n => n.getAnimations().forEach(a => { a.currentTime = 4000; }));
  });
}

test('Raleigh wings and leaves change pixels independently of travel, with alternating visits', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openRaleigh(page);
  await expect(page.locator('.meadow-birds')).toHaveCount(0);
  await expect(page.locator('.raleigh-leaf-path')).toHaveCount(6);
  await freezeScene(page);
  for (const [selector, frames, period] of [
    ['.raleigh-cardinal.raleigh-bird-flight .raleigh-bird-sprite', 4, 480],
    ['.raleigh-blue-jay.raleigh-bird-flight .raleigh-bird-sprite', 4, 480],
    ['.raleigh-leaf-sprite', 5, 800],
  ] as const) {
    if (selector.includes('blue-jay')) await page.locator('.raleigh-bird-flight').evaluateAll(nodes => nodes.forEach(n => n.getAnimations().forEach(a => { a.currentTime = 24000; })));
    const sprite = page.locator(selector).first();
    const positions = [], pixels = new Set<string>(), frameOffsets = new Set<string>();
    for (let frame = 0; frame < frames; frame++) {
      await sprite.evaluate((node, time) => node.getAnimations().forEach(a => { a.currentTime = time; }), (frame + .25) * period / frames);
      const box = await sprite.boundingBox(); positions.push([box!.x, box!.y]);
      frameOffsets.add(await sprite.evaluate(node => getComputedStyle(node).backgroundPositionX));
      const screenshot = await sprite.screenshot({ animations: 'allow', scale: 'css' });
      pixels.add((await sharp(screenshot).raw().toBuffer()).toString('base64'));
    }
    expect(new Set(positions.map(p => JSON.stringify(p))).size).toBe(1);
    expect(frameOffsets.size).toBe(frames);
    // The original cardinal sheet repeats its intermediate wing pose in cells 1 and 3.
    expect(pixels.size).toBeGreaterThanOrEqual(selector.includes('cardinal') ? 3 : frames);
  }
  for (const [time, species] of [[0, null], [4000, 'cardinal'], [12000, null], [24000, 'blue-jay'], [32000, null], [44000, 'cardinal']] as const) {
    await page.locator('.raleigh-bird-flight').evaluateAll((nodes, time) => nodes.forEach(n => n.getAnimations().forEach(a => { a.currentTime = time; })), time);
    const visible = await page.locator('.raleigh-bird-flight').evaluateAll(nodes => nodes.filter(n => Number(getComputedStyle(n).opacity) > .1).map(n => n.getAttribute('data-species')));
    expect(visible).toEqual(species ? [species] : []);
  }
  expect(errors).toEqual([]);
});

for (const [name, options, birdCount, leafCount] of [
  ['overcast', { code: 3 }, 2, 6],
  ['night', { night: true }, 0, 6],
  ['rain', { code: 63 }, 0, 6],
  ['storm', { code: 95, wind: 40 }, 0, 6],
  ['snow', { code: 73 }, 0, 0],
  ['unknown', { code: 999 }, 0, 0],
] as const) {
  test(`Raleigh ${name}: weather eligibility and lighting`, async ({ page }) => {
    await openRaleigh(page, options);
    await expect(page.locator('.raleigh-bird-flight')).toHaveCount(birdCount);
    await expect(page.locator('.raleigh-leaf-path')).toHaveCount(leafCount);
    if (name === 'night') expect(await page.locator('.raleigh-wildlife').evaluate(n => getComputedStyle(n).filter)).toContain('brightness(0.45)');
    if (name === 'storm') expect(await page.locator('.raleigh-leaf-path').first().evaluate(n => getComputedStyle(n).animationDuration)).toBe('9s');
  });
}

test('Raleigh calm wind slows leaf drift and keeps river discovery usable', async ({ page }) => {
  await openRaleigh(page, { wind: 0 });
  expect(await page.locator('.raleigh-leaf-path').first().evaluate(n => getComputedStyle(n).animationDuration)).toBe('18s');
  await page.getByRole('button', { name: 'Make a river ripple' }).click();
  await expect(page.locator('.river-discovery')).toBeVisible();
});

test('Blue Ridge keeps its existing silhouettes and has no Raleigh layers', async ({ page }) => {
  await openRaleigh(page, { place: asheville });
  await expect(page.locator('.raleigh-wildlife')).toHaveCount(0);
  await expect(page.locator('.meadow-birds')).toHaveCount(1);
});

test('Raleigh reduced motion, hidden documents, and offscreen scenes stop all sprite motion', async ({ page }) => {
  await openRaleigh(page);
  const moving = () => page.locator('.raleigh-wildlife').evaluate(n => n.getAnimations({ subtree: true }).some(a => a.playState === 'running'));
  const quiet = async () => {
    await expect.poll(moving).toBe(false);
    await expect(page.locator('.raleigh-resting-bird')).toBeVisible();
    await expect(page.locator('.raleigh-leaves')).toBeHidden();
  };
  await expect.poll(moving).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Reduce animation', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await quiet();
  const first = await page.locator('.raleigh-resting-bird').screenshot({ animations: 'allow' });
  const second = await page.locator('.raleigh-resting-bird').screenshot({ animations: 'allow' });
  expect(first.equals(second)).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Reduce animation', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await quiet();
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await expect.poll(moving).toBe(true);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await quiet();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(moving).toBe(true);
  await page.setViewportSize({ width: 390, height: 400 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('.scenery')).toHaveAttribute('data-in-view', 'false');
  await expect.poll(moving).toBe(false);
  await page.evaluate(() => window.scrollTo(0, 0)); await expect.poll(moving).toBe(true);
});

test('Raleigh sprites remain below weather text and do not block controls at all scene sizes', async ({ page, browserName }) => {
  await openRaleigh(page);
  await freezeScene(page);
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.locator('.scenery').evaluate(n => {
      const box = n.getBoundingClientRect();
      return Math.abs(Number(getComputedStyle(n).getPropertyValue('--cover-scale')) - Math.max(box.width / 960, box.height / 801));
    })).toBeLessThan(.001);
    const weather = await page.locator('.current-weather').boundingBox();
    const bird = await page.locator('.raleigh-cardinal.raleigh-bird-flight').boundingBox();
    expect(bird!.y).toBeGreaterThan(weather!.y + weather!.height);
    expect(await page.locator('.raleigh-wildlife').evaluate(n => getComputedStyle(n).pointerEvents)).toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Blink the weather station light' }).click();
    await expect(page.locator('.indicator-active')).toBeVisible();
    await page.locator('.scenery').screenshot({ path: `/tmp/raleigh-wildlife/${browserName}-${width}.png`, animations: 'allow' });
  }
});

test('Raleigh wildlife and notices are precached and load after an offline reload', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service-worker lifecycle is verified in Chromium.');
  await openRaleigh(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(async urls => (await Promise.all(urls.map(url => caches.match(url, { ignoreSearch: true })))).every(Boolean), assets)).toBe(true);
  await page.unroute('https://api.open-meteo.com/**');
  await context.setOffline(true); await page.reload();
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', 'raleigh');
  expect(await page.evaluate(async urls => (await Promise.all(urls.map(async url => (await fetch(url)).ok))).every(Boolean), assets)).toBe(true);
  await expect(page.getByText('You’re offline. Showing your saved forecast.')).toBeVisible();
});
