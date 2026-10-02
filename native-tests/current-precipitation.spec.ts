import { expect, test } from '@playwright/test';
import { installBridge } from './bridge';
import { apiFixture, forecastFixture } from '../src/test/fixtures';
import { reconcileCurrentPrecipitation } from '../server/current-precipitation';

test('native app and widget handoff preserve radar correction and source',async ({page}) => {
  const bridge = await installBridge(page);
  const now = Date.now();
  await page.route('**/api/weather?**',route => {
    const data = apiFixture(forecastFixture(now,3),route.request().url());
    if (data.current) data.current = reconcileCurrentPrecipitation({...data.current,precipitationProbability:0,precipitationRate:0},{kind:'rain',time:Math.floor(now/1000)},now);
    return route.fulfill({json:data,headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/');
  await expect(page.locator('.condition')).toHaveText('Rain on radar');
  await expect(page.getByRole('link',{name:'NOAA radar',exact:true})).toBeVisible();
  await expect.poll(() => JSON.stringify(bridge.calls.filter(call=>call.plugin==='WeatherWidget' && call.method==='update'))).toContain('radarPrecipitation');
  await expect.poll(() => JSON.stringify(bridge.calls.filter(call=>call.plugin==='WeatherWidget' && call.method==='update'))).toContain('Rain on radar');
});
