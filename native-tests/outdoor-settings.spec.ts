import { expect, test } from '@playwright/test';
import { installBridge, savedState, storageKey } from './bridge';
import { mockOutdoor } from '../tests/support/outdoor';

test('native Best time outside defaults off and saves visibility through Capacitor Preferences', async ({ page }) => {
  const bridge = await installBridge(page);
  const state = await mockOutdoor(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Best time outside' });
  const toggle = page.getByRole('switch', { name: 'Best time outside' });
  await expect(page.locator('.briefing-copy')).toContainText('A mild forecast');
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect.poll(() => JSON.parse(bridge.store.get(storageKey)!).preferences.bestTimeOutside).toBe(true);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeVisible();
  await page.reload();
  await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect.poll(() => JSON.parse(bridge.store.get(storageKey)!).preferences.bestTimeOutside).toBe(false);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.briefing-copy')).toContainText('A mild forecast');
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(toggle).not.toBeChecked();
  expect(JSON.parse(bridge.store.get(storageKey)!)).toEqual({
    ...savedState, preferences: { ...savedState.preferences, bestTimeOutside: false },
  });
  expect(state.outdoorRequests).toBe(0);
  expect(state.errors).toEqual([]);
});
