import { expect, test } from '@playwright/test';
import { tokyo, forecastFixture } from '../src/test/fixtures';

for (const [name, code, isDay] of [['day', 0, 1], ['overcast', 3, 1], ['night', 0, 0]] as const) {
  test(`station stays attached through a full rotation and image cropping: ${name}`, async ({ page }) => {
    await page.addInitScript(place => localStorage.setItem('8bit-weather:v1', JSON.stringify({
      selected: place, places: [place], preferences: { units: 'imperial', reducedMotion: false },
    })), tokyo);
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify({ ...forecastFixture(Date.now(), code, isDay), daily: { ...forecastFixture(Date.now()).daily, sunrise:[], sunset:[] } }),
    }));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible();
    await expect.poll(() => page.locator('.landscape-art').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const offsets = await page.evaluate(() => {
        const image = document.querySelector<HTMLImageElement>('.landscape-art')!;
        const rect = image.getBoundingClientRect();
        const scale = Math.max(rect.width / 960, rect.height / 801);
        // The mast's pivot is authored at (195, 511) in the original landscape.
        // Derive its screen position from the raster's cover / center-bottom crop,
        // independently of the animation's SVG transform.
        const x = rect.left + (rect.width - 960 * scale) / 2 + 195 * scale;
        const y = rect.bottom - 801 * scale + 511 * scale;
        const animation = document.querySelector('.station-rotor-strip')!.getAnimations()[0];
        animation.pause();
        const result = [];
        for (let frame = 0; frame < 12; frame++) {
          animation.currentTime = Number(animation.effect!.getTiming().duration) * (frame + .5) / 12;
          const hub = document.querySelector('.station-hub')!.getBoundingClientRect();
          result.push(Math.hypot(hub.x + hub.width / 2 - x, hub.y + hub.height / 2 - y));
        }
        animation.play();
        return result;
      });
      expect(Math.max(...offsets)).toBeLessThan(.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('switch', { name: 'Reduce animation', exact: true }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator('.scenery')).toHaveAttribute('data-animate', 'false');
    await expect.poll(() => page.locator('.station-rotor-strip').evaluate(node => node.getAnimations()[0].playState)).toBe('paused');
  });
}

test('station follows the taller first-use landscape crop', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your weather' })).toBeVisible();
  await expect.poll(() => page.locator('.landscape-art').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const offset = await page.evaluate(() => {
      const image = document.querySelector<HTMLImageElement>('.landscape-art')!;
      const rect = image.getBoundingClientRect();
      const scale = Math.max(rect.width / 960, rect.height / 801);
      const hub = document.querySelector('.station-hub')!.getBoundingClientRect();
      return Math.hypot(hub.x + hub.width / 2 - (rect.left + (rect.width - 960 * scale) / 2 + 195 * scale),
        hub.y + hub.height / 2 - (rect.bottom - 801 * scale + 511 * scale));
    });
    expect(offset).toBeLessThan(.5);
  }
});
