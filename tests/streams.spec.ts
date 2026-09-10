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
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
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
      const current = page.locator('.stream-highlight').first();
      const offset = await current.evaluate(node => getComputedStyle(node).strokeDashoffset);
      await expect.poll(() => current.evaluate(node => getComputedStyle(node).strokeDashoffset)).not.toBe(offset);

      // Freeze the rest of the scene and compare actual painted pixels at two
      // stream phases. A changing CSS property alone does not prove visible flow.
      await page.evaluate(() => document.querySelector('.landscape')!.getAnimations({ subtree: true }).forEach(animation => animation.pause()));
      const setPhase = async (time: number) => page.evaluate(time => {
        document.querySelectorAll('.stream-current,.stream-eddy').forEach(node => node.getAnimations().forEach(animation => { animation.currentTime = time; }));
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
