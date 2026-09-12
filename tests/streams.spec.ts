import { browserApiFixture as apiFixture } from '../src/test/fixtures';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { asheville, tokyo, forecastFixture } from '../src/test/fixtures';
import type { Place } from '../src/types';

const raleigh: Place = { ...asheville, id: '4487042', name: 'Raleigh', latitude: 35.7796, longitude: -78.6382 };
const locations = [['meadow', tokyo], ['raleigh', raleigh]] as const;

async function openStream(page: Page, place: Place, light: 'day' | 'overcast' | 'night' = 'day') {
  const now = Date.parse(light === 'night' ? '2026-09-08T03:00:00Z' : '2026-09-07T18:00:00Z');
  await page.clock.setFixedTime(now);
  await page.addInitScript(({ selected, places }) => {
    if (!localStorage.getItem('8bit-weather:v1')) localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected, places, preferences: { units: 'imperial' } }));
  }, { selected: place, places: [tokyo, raleigh] });
  const data = forecastFixture(now, light === 'overcast' ? 63 : 0, light === 'night' ? 0 : 1);
  data.current.time = now / 1000;
  await page.route('**/api/weather?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(apiFixture(data, route.request().url())) }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
  await expect.poll(() => page.locator('.art-layer').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
}

for (const [landscape, place] of locations) {
  for (const light of ['day', 'overcast', 'night'] as const) {
    test(`${landscape} stream flows with the ${light} artwork and stays inside the creek`, async ({ page }) => {
      await openStream(page, place, light);
      await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', landscape);
      await expect(page.locator('.art-layer').first()).toHaveAttribute('src', landscape === 'raleigh' ? '/art/scene-raleigh-day-v1.webp' : '/art/scene-day-v2.webp');
      if (landscape === 'raleigh') {
        await expect(page.locator('.raleigh-water-flow')).toHaveCount(9);
        await expect(page.locator('.stream-current')).toHaveCount(0);
        const frame = page.locator('.raleigh-water-flow').first();
        const transform = await frame.evaluate(node => getComputedStyle(node).transform);
        await expect.poll(() => frame.evaluate(node => getComputedStyle(node).transform)).not.toBe(transform);
      } else {
        const current = page.locator('.stream-highlight').first();
        const offset = await current.evaluate(node => getComputedStyle(node).strokeDashoffset);
        await expect.poll(() => current.evaluate(node => getComputedStyle(node).strokeDashoffset)).not.toBe(offset);
        await expect(page.locator('.raleigh-river-surface')).toHaveCount(0);
      }

      // Freeze the rest of the scene and compare actual painted pixels at two
      // stream phases. A changing CSS property alone does not prove visible flow.
      await page.evaluate(() => document.querySelector('.landscape')!.getAnimations({ subtree: true }).forEach(animation => animation.pause()));
      const setPhase = async (time: number) => page.evaluate(time => {
        document.querySelectorAll('.stream-current,.stream-eddy,.raleigh-water-flow').forEach(node => node.getAnimations().forEach(animation => { animation.currentTime = time; }));
      }, time);
      await setPhase(250);
      const first = await page.locator('.landscape').screenshot({ scale: 'css', animations: 'allow' });
      await setPhase(1550);
      const second = await page.locator('.landscape').screenshot({ scale: 'css', animations: 'allow' });
      const a = await sharp(first).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const b = await sharp(second).ensureAlpha().raw().toBuffer();
      const scale = Math.max(a.info.width / 960, a.info.height / 801);
      const waterTop = a.info.height - (801 - 670) * scale;
      let changed = 0, outsideWater = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const difference = Math.max(...[0, 1, 2].map(channel => Math.abs(a.data[i + channel] - b[i + channel])));
        if (difference <= 6) continue;
        changed++;
        if (Math.floor(i / 4 / a.info.width) < waterTop) outsideWater++;
      }
      expect(changed).toBeGreaterThan(100);
      if (landscape === 'raleigh') {
        // The flowing texture stays a small part of the scene crop.
        expect(changed).toBeLessThan(a.info.width * a.info.height * .04);

      }
      expect(outsideWater).toBe(0);
      await expect(page.locator('.stream-water')).toHaveAttribute('clip-path', /url\(#stream-/);
      await page.screenshot({ path: `/tmp/8bit-weather-stream-${landscape}-${light}.png`, fullPage: true });
    });
  }

  test(`${landscape} stream respects motion settings, visibility, and the river discovery`, async ({ page }) => {
    await openStream(page, place);
    const state = () => page.locator('.stream').evaluate(node => node.getAnimations({ subtree: true }).every(animation => animation.playState === 'paused'));
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('switch', { name: 'Reduce animation', exact: true }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect.poll(state).toBe(true);
    await page.getByRole('button', { name: 'Make a river ripple' }).click();
    await expect(page.locator('.river-discovery')).toBeVisible();
    expect(await page.locator('.river-discovery').evaluate(node => getComputedStyle(node).animationName)).toBe('none');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('switch', { name: 'Reduce animation', exact: true }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect.poll(state).toBe(false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(state).toBe(true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(state).toBe(false);
    await page.setViewportSize({ width: 390, height: 400 });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(state).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(state).toBe(false);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(state).toBe(true);
  });
}

test('saved places switch between the original meadow and Raleigh artwork', async ({ page }) => {
  await openStream(page, tokyo);
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page.getByRole('button', { name: /Raleigh.*North Carolina/ }).click();
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', 'raleigh');
  await page.reload();
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', 'raleigh');
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await page.getByRole('button', { name: /Tokyo.*Japan/ }).click();
  await expect(page.locator('.scenery')).toHaveAttribute('data-landscape', 'meadow');
});

// Test actual rendered texture pixels across the wrap. Merely checking that an
// animation runs or that two frames differ missed the earlier backward snap.
test('Raleigh texture advances downstream across its last-to-first frame', async ({ page }) => {
  await openStream(page, raleigh);
  await page.evaluate(async () => {
    await Promise.all(['day', 'overcast', 'night'].map(light => {
      const image = new Image(); image.src = `/art/raleigh-water/water-${light}.png`; return image.decode();
    }));
  });
  for (const light of ['day', 'overcast', 'night']) for (const reach of [0, 1, 2]) {
    await page.evaluate(({ light, reach }) => {
      document.getElementById('water-loop-probe')?.remove();
      const surface = document.querySelector('.raleigh-river-surface')!;
      const flow = surface.querySelector(`[data-water-light="${light}"] [data-flow-reach="${reach}"]`)!.cloneNode(true) as SVGElement;
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      probe.id = 'water-loop-probe';
      probe.setAttribute('viewBox', '520 720 128 64');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:128px;height:64px;z-index:99999;--river-flow-duration:12s;image-rendering:pixelated';
      // Use production pattern definitions, tile images, frame CSS and flow rect.
      // A fixed probe removes the stationary painting so pixel travel is measurable.
      probe.append(surface.querySelector('defs')!.cloneNode(true), flow);
      document.body.append(probe);
      flow.getAnimations().forEach(a => a.pause());
    }, { light, reach });
    const capture = async (step: number) => {
      await page.locator('#water-loop-probe .raleigh-water-flow').evaluate((node, step) => {
        node.getAnimations().forEach(a => { a.currentTime = (step + .1) * 12000 / 32; });
      }, step);
      return sharp(await page.locator('#water-loop-probe').screenshot({ scale: 'css', animations: 'allow' })).ensureAlpha().raw().toBuffer();
    };
    const last = await capture(31), wrapped = await capture(32), next = await capture(33);
    const dx = reach === 0 ? -2 : 2, dy = reach === 0 ? 0 : 1;
    for (const [before, after] of [[last, wrapped], [wrapped, next]]) {
      let error = 0, stationaryError = 0;
      for (let y = 3; y < 61; y++) for (let x = 4; x < 124; x++) {
        const p = (y * 128 + x) * 4, q = ((y - dy) * 128 + x - dx) * 4;
        for (let c = 0; c < 3; c++) {
          error += Math.abs(after[p + c] - before[q + c]);
          stationaryError += Math.abs(after[p + c] - before[p + c]);
        }
      }
      expect(stationaryError).toBeGreaterThan(1000);
      // Exact directional pixel correspondence must hold at and after the wrap.
      expect(error).toBeLessThan(100);
    }
  }
});

test('Raleigh flow textures load after an offline reload', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service-worker lifecycle is checked in Chromium.');
  await openStream(page, raleigh);
  const textures = [...['day', 'overcast', 'night'].map(light => `/art/raleigh-water/water-${light}.png`), '/art/raleigh-water/coverage.png'];
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(async urls => (await Promise.all(urls.map(url => caches.match(url, { ignoreSearch: true })))).every(Boolean), textures)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  expect(await page.evaluate(async urls => (await Promise.all(urls.map(async url => (await fetch(url)).ok))).every(Boolean), textures)).toBe(true);
  await expect(page.locator('.raleigh-water-flow')).toHaveCount(9);
});
