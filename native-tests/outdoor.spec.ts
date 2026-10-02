import { expect, test } from '@playwright/test';
import { installBridge, savedState, storageKey } from './bridge';
import { mockOutdoor } from '../tests/support/outdoor';

test('native outdoor filters preview tomorrow while preserving widgets and cloud request counts', async ({ page }, info) => {
  const bridge = await installBridge(page);
  const state = await mockOutdoor(page);
  await page.goto('/');
  await expect(page.locator('.briefing-copy')).toContainText('A mild forecast');
  await expect.poll(() => bridge.widgets.length).toBeGreaterThan(0);
  const widgetCount = bridge.widgets.length;
  const current = await page.locator('.current-stats').innerText();
  const counts = [state.weatherRequests, state.briefingRequests];
  const card = page.getByRole('region', { name: 'Best time outside' });
  await card.getByRole('button', { name: 'Tomorrow', exact: true }).click();
  expect(state.outdoorRequests).toBe(0);
  await card.getByRole('button', { name: 'Ask OpenAI' }).click();
  await expect(card).toContainText('12:00 PM–1:00 PM');
  expect(state.outdoorRequests).toBe(1);
  await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.screenshot({ path: `/tmp/8bit-outside-${info.project.name}.png` });
  const preview = card.getByRole('button', { name: 'Preview this hour' });
  if (info.project.name === 'native-webkit') await preview.tap(); else await preview.click();
  const slider = page.getByRole('slider', { name: 'Forecast preview time' });
  await expect(slider).toHaveValue('26'); await expect(slider).toBeFocused();
  await expect(page.locator('.scenery')).toBeInViewport();
  await expect(page.locator('.scenery')).toHaveAttribute('data-animate', 'false');
  expect(await page.locator('.current-stats').innerText()).toBe(current);
  expect(bridge.widgets).toHaveLength(widgetCount);
  expect([state.weatherRequests, state.briefingRequests]).toEqual(counts);
  await expect.poll(() => bridge.calls.filter(call => call.method === 'triggerHaptic').length).toBe(1);
  await page.getByRole('button', { name: 'Back to now' }).click();
  await expect(slider).toHaveValue('0');
  expect(state.errors).toEqual([]);
});

test('native saved recommendations work offline and navigation resets availability', async ({ page, context }) => {
  await installBridge(page);
  await mockOutdoor(page);
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Best time outside' });
  await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeVisible();
  await card.getByRole('button', { name: 'Ask OpenAI' }).click();
  await expect(card).toContainText('11:00 AM');
  await expect(page.locator('.briefing-copy')).toContainText('A mild forecast');
  await context.setOffline(true);
  await expect(card).toContainText('Saved AI recommendation');
  await card.getByRole('button', { name: 'Tomorrow', exact: true }).click();
  await expect(card).toContainText('Connect to generate');
  await expect(card.getByRole('button', { name: 'Ask OpenAI' })).toBeDisabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

for (const fails of [false, true]) test(`outdoor uses only OpenAI with Apple briefings selected, including ${fails ? 'cloud failure' : 'success'}`, async ({ page }) => {
  const bridge = await installBridge(page, { [storageKey]: JSON.stringify({
    ...savedState, preferences: { ...savedState.preferences, briefingProvider: 'apple' },
  }) });
  bridge.control.appleAvailable = true;
  bridge.control.appleText = 'Temperatures stay mild today. Hourly precipitation chances peak at 10%.';
  const state = await mockOutdoor(page);
  state.outdoorFailure = fails;
  await page.goto('/');
  await expect(page.locator('.briefing-copy')).toContainText(bridge.control.appleText);
  const appleCalls = () => bridge.calls.filter(call => call.plugin === 'AppleBriefing' && call.method === 'generate');
  expect(appleCalls()).toHaveLength(1);
  const card = page.getByRole('region', { name: 'Best time outside' });
  await card.getByRole('button', { name: 'Ask OpenAI' }).click();
  await expect(card).toContainText(fails ? 'AI couldn’t generate a recommendation' : 'AI recommendation · OpenAI');
  expect(state.outdoorRequests).toBe(1);
  expect(appleCalls()).toHaveLength(1);
  expect(JSON.parse(bridge.store.get(storageKey)!).preferences.briefingProvider).toBe('apple');
});
