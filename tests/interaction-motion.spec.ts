import { browserApiFixture as apiFixture } from '../src/test/fixtures';
import { test } from '@playwright/test';
import { forecastFixture } from '../src/test/fixtures';
import { savedState, storageKey } from '../native-tests/bridge';
import { checkInteractionMotion } from './support/interaction-motion';

test('scroll boundaries and UV disclosure animate accessibly on the web', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(({ state, key }) => localStorage.setItem(key, JSON.stringify(state)), {
    state: { ...savedState, preferences: { ...savedState.preferences, reducedMotion: false } }, key: storageKey,
  });
  await page.route('**/api/weather?**', route => route.fulfill({ json: apiFixture(forecastFixture(Date.now()), route.request().url()) }));
  await page.route('**/api/weather-briefing', route => route.fulfill({ status: 503, json: { code: 'unavailable' } }));
  await checkInteractionMotion(page, `8bit-motion-${testInfo.project.name}`);
});
