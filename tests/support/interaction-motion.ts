import { expect, type Page } from '@playwright/test';

export async function checkInteractionMotion(page: Page, screenshotPrefix: string, native = false) {
  await page.goto('/');
  const button = page.getByRole('button', { name: /UV index .*details/ });
  await expect(button).toBeVisible();
  const panel = page.locator('.uv-disclosure');
  expect(await panel.evaluate(el => el.getBoundingClientRect().height)).toBe(0);
  await button.click();
  await expect(panel).toHaveAttribute('data-expanded', 'true');
  // Sample the actual layout transition in both browser engines, not a timeout.
  const sample = async () => panel.evaluate(async el => {
    await new Promise(requestAnimationFrame);
    const transitions = el.getAnimations();
    transitions.forEach(animation => { animation.pause(); animation.currentTime = 160; });
    const middle = el.getBoundingClientRect().height;
    transitions.forEach(animation => animation.finish());
    const end = el.getBoundingClientRect().height;
    return { middle, end, count: transitions.length };
  });
  const opening = await sample();
  expect(opening.count).toBeGreaterThan(0);
  expect(opening.middle).toBeGreaterThan(0);
  expect(opening.middle).toBeLessThan(opening.end);
  await expect(page.getByRole('slider', { name: 'UV forecast hour' })).toBeVisible();
  await panel.screenshot({ path: `/tmp/${screenshotPrefix}-uv.png` });
  await button.click();
  await expect(page.getByRole('slider', { name: 'UV forecast hour' })).toHaveCount(0);
  const closing = await sample();
  expect(closing.middle).toBeGreaterThan(0);
  expect(closing.middle).toBeLessThan(opening.end);
  expect(closing.end).toBe(0);
  // Reversing direction mid-transition must settle into the last requested state.
  await button.evaluate(el => { (el as HTMLElement).click(); (el as HTMLElement).click(); (el as HTMLElement).click(); });
  await expect(panel).toHaveAttribute('data-expanded', 'true');
  await expect(page.getByRole('slider', { name: 'UV forecast hour' })).toBeVisible();
  await button.click();
  await expect.poll(() => panel.evaluate(el => el.getBoundingClientRect().height)).toBe(0);

  const briefingToggle = page.getByRole('button', { name: /Weather briefing/ });
  const briefingPanel = page.locator('.briefing-disclosure');
  await expect(briefingToggle).toHaveAttribute('aria-expanded', 'true');
  const briefingHeight = await briefingPanel.evaluate(el => el.getBoundingClientRect().height);
  const sampleBriefing = () => briefingPanel.evaluate(async el => {
    await new Promise(requestAnimationFrame);
    const animations = el.getAnimations();
    animations.forEach(animation => { animation.pause(); animation.currentTime = 160; });
    const middle = el.getBoundingClientRect().height;
    animations.forEach(animation => animation.finish());
    return { middle, end: el.getBoundingClientRect().height, count: animations.length };
  });
  await briefingToggle.click();
  await expect(briefingToggle).toHaveAttribute('aria-expanded', 'false');
  const briefingClosing = await sampleBriefing();
  expect(briefingClosing.count).toBeGreaterThan(0);
  expect(briefingClosing.middle).toBeGreaterThan(0);
  expect(briefingClosing.middle).toBeLessThan(briefingHeight);
  expect(briefingClosing.end).toBe(0);
  await expect(briefingPanel).toHaveAttribute('inert', '');
  await briefingToggle.press('Enter');
  const briefingOpening = await sampleBriefing();
  expect(briefingOpening.middle).toBeGreaterThan(0);
  expect(briefingOpening.middle).toBeLessThan(briefingOpening.end);
  await expect(briefingToggle).toBeFocused();
  await page.locator('.weather-briefing').screenshot({ path: `/tmp/${screenshotPrefix}-briefing.png` });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await briefingToggle.click();
  expect(await briefingPanel.evaluate(el => el.getAnimations().length)).toBe(0);
  expect(await briefingPanel.evaluate(el => el.getBoundingClientRect().height)).toBe(0);
  await briefingToggle.click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  if (native) {
    // UIKit owns the boundary gesture. Browser mocks can verify the absence of
    // JS interception; rubber-band physics are checked in the real simulator.
    await expect(page.locator('.scroll-edge-feedback, .pull-refresh-surface')).toHaveCount(0);
    expect(await page.locator('html').evaluate(el => getComputedStyle(el).overscrollBehaviorY)).toBe('auto');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await button.click();
    expect(await panel.evaluate(el => el.getAnimations().length)).toBe(0);
    await button.click();
    expect(await panel.evaluate(el => el.getBoundingClientRect().height)).toBe(0);
    return;
  }

  // Offline touch pulls still acknowledge the top; they must not trigger refresh.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
    window.scrollTo(0, 0);
  });
  await expect(page.getByText('You’re offline. Showing your saved forecast.', { exact: true })).toBeVisible();
  const gesture = async (selector: string, dy: number) => page.locator(selector).evaluate((el, dy) => {
    const send = (name: string, y: number) => {
      const event = new Event(name, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { value: name === 'touchend' ? [] : [{ identifier: 1, clientX: 150, clientY: y }] });
      el.dispatchEvent(event);
    };
    send('touchstart', 300); send('touchmove', 300 + dy); send('touchend', 300 + dy);
  }, dy);
  await gesture('.current-temperature', 60);
  const top = page.locator('.scroll-edge-feedback [data-edge="top"]');
  await expect.poll(() => top.evaluate(el => el.getAnimations().length)).toBe(1);
  await top.evaluate(el => el.getAnimations().forEach(animation => animation.finish()));
  // Wait for the pulse's re-arm interval before the next independent gesture.
  await page.waitForTimeout(460);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await gesture('.forecast-footer', -60);
  const bottom = page.locator('.scroll-edge-feedback [data-edge="bottom"]');
  await expect.poll(() => bottom.evaluate(el => el.getAnimations().length)).toBe(1);
  await bottom.evaluate(el => el.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 112; }));
  await page.screenshot({ path: `/tmp/${screenshotPrefix}-edge.png` });
  await bottom.evaluate(el => el.getAnimations().forEach(animation => animation.finish()));
  expect(await page.evaluate(() => innerWidth >= document.documentElement.scrollWidth)).toBe(true);

  await page.waitForTimeout(460);
  await page.evaluate(() => window.scrollTo(0, 0));
  await gesture('.hourly-rail', 60);
  expect(await top.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.locator('.current-temperature').dispatchEvent('wheel', { deltaY: -100 });
  expect(await top.evaluate(el => el.getAnimations().length)).toBe(1);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.app-shell')).toHaveClass(/motion-reduced/);
  expect(await top.evaluate(el => el.getAnimations().length)).toBe(0);
  await button.click();
  expect(await panel.evaluate(el => el.getAnimations().length)).toBe(0);
  await button.click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('switch', { name: 'Reduce animation' }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await button.click();
  expect(await panel.evaluate(el => el.getAnimations().length)).toBe(0);
  await button.click();
  expect(await panel.evaluate(el => el.getBoundingClientRect().height)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await gesture('.current-temperature', 60);
  expect(await top.evaluate(el => el.getAnimations().length)).toBe(0);
}
