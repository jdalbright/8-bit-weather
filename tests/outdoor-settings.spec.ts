import { expect, test } from '@playwright/test';
import { asheville } from '../src/test/fixtures';
import { mockOutdoor } from './support/outdoor';

test('Best time outside starts off and remembers both toggle choices across reloads', async ({ page }, info) => {
  await page.addInitScript(place => {
    if (!localStorage.getItem('8bit-weather:v1')) localStorage.setItem('8bit-weather:v1', JSON.stringify({
      selected: place, places: [place], preferences: { units: 'imperial', reducedMotion: true },
    }));
  }, asheville);
  const state = await mockOutdoor(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Best time outside' });
  const toggle = page.getByRole('switch', { name: 'Best time outside' });
  await expect(page.locator('.briefing-copy')).toContainText('A mild forecast');
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(toggle).not.toBeChecked();
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(toggle).toBeInViewport();
  expect(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/8bit-outdoor-settings-${info.project.name}.png` });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeVisible();
  await page.reload();
  await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.briefing-copy')).toContainText('A mild forecast');
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(toggle).not.toBeChecked();
  expect(state.outdoorRequests).toBe(0);
  expect(state.errors).toEqual([]);
});
