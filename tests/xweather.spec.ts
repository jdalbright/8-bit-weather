import { expect, test } from '@playwright/test';
import { apiFixture, asheville, forecastFixture } from '../src/test/fixtures';
import { reconcileCurrentPrecipitation } from '../server/current-precipitation';

test('fresh Xweather sections are reused for manual refresh and NOAA is independent',async({page})=> {
  let requests=0;
  await page.addInitScript(place=>localStorage.setItem('8bit-weather:v1',JSON.stringify({selected:place,places:[place],preferences:{reducedMotion:true}})),asheville);
  await page.route('**/api/weather?**',route=> {
    requests++;
    return route.fulfill({json:apiFixture(forecastFixture(Date.now()),route.request().url())});
  });
  await page.goto('/');
  await expect(page.getByRole('link',{name:'Powered by Vaisala Xweather'})).toBeVisible();
  await expect.poll(()=>requests).toBe(4);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();
  expect(requests).toBe(4);
  await page.getByRole('button',{name:'Radar',exact:true}).click();
  await expect(page.getByText(/NOAA/).first()).toBeVisible();
  expect(requests).toBe(4);
});

test('independent rain correction reaches the headline, current metric, scene and Now tile, then becomes saved when radar expires', async ({page},testInfo) => {
  const now = Date.parse('2026-09-12T17:22:05Z');
  await page.clock.install({time:now});
  await page.addInitScript(place => localStorage.setItem('8bit-weather:v1',JSON.stringify({selected:place,places:[place],preferences:{reducedMotion:true}})),asheville);
  let unavailable = false;
  await page.route('**/api/weather?**',route => {
    if (unavailable) return route.fulfill({status:503,json:{code:'weather_unavailable'}});
    const data = apiFixture(forecastFixture(now,3),route.request().url());
    if (data.current) {
      data.current = reconcileCurrentPrecipitation({...data.current,precipitationProbability:0,precipitationRate:0}, {kind:'rain',time:(now-5000)/1000},now);
      data.expiresAt = now+120000;
    }
    return route.fulfill({json:data});
  });
  await page.goto('/');
  await expect(page.locator('.condition')).toHaveText('Rain on radar');
  await expect(page.locator('.scenery').first()).toHaveAttribute('data-scene','rain-day');
  await expect(page.getByRole('link',{name:'NOAA radar',exact:true})).toBeVisible();
  const stat = page.getByText('Current precipitation',{exact:true}).locator('..').locator('..');
  await expect(stat).toContainText('RainNow');
  await expect(stat).not.toContainText('0%');
  await expect(page.locator('.hour').first()).toHaveAccessibleName(/Now, Rain on radar.*Precipitation: Rain/);
  await page.screenshot({path:testInfo.outputPath('radar-correction.png'),fullPage:true});
  unavailable = true;
  await page.clock.fastForward(8*60000);
  await expect(stat).toContainText('RainSaved');
  await expect(page.locator('.offline-notice')).toContainText('This forecast is getting old');
});

test('zero-percent forecast and resolved clouds do not inherit a cached possible-storm headline', async ({ page }) => {
  await page.addInitScript(place => localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: place, places: [place], preferences: { reducedMotion: true } })), asheville);
  await page.route('**/api/weather?**', route => {
    const raw = forecastFixture(Date.now(), 3);
    raw.hourly.precipitation_probability = raw.hourly.time.map(() => 0);
    const data = apiFixture(raw, route.request().url());
    if (data.current) {
      data.current.conditionLabel = 'Thunderstorms possible';
      data.current.precipitationProbability = 0;
    }
    return route.fulfill({ json: data });
  });
  await page.goto('/');
  await expect(page.locator('.condition')).toHaveText('Overcast');
  await expect(page.locator('.hour').first()).toHaveAccessibleName(/Now, Overcast.*Chance of precipitation: 0%/);
  await expect(page.locator('.forecast-scene .rainfall')).toHaveCount(0);
  await expect(page.locator('.current-weather')).not.toContainText(/possible|Estimated conditions/);
  await expect(page.locator('.current-weather .saved-observation')).toContainText('As of');
});

for (const probability of [0, 76, null]) {
  test(`current percentage uses its own conditions reading (${probability}), not the hourly forecast`, async ({ page }) => {
    await page.addInitScript(place => localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: place, places: [place], preferences: { reducedMotion: true } })), asheville);
    await page.route('**/api/weather?**', route => {
      const raw = forecastFixture(Date.now(), probability === 0 ? 3 : 95);
      raw.hourly.precipitation_probability = raw.hourly.time.map(() => 0);
      const data = apiFixture(raw, route.request().url());
      if (data.current) data.current.precipitationProbability = probability;
      return route.fulfill({ json: data });
    });
    await page.goto('/');
    const expected = probability === null ? '—' : `${probability}%`;
    const stat = page.getByText('Current precipitation chance', { exact: true }).locator('..').locator('..');
    await expect(stat).toContainText(`${expected}Now`);
    await expect(page.locator('.hour').first()).toHaveAccessibleName(new RegExp(`Chance of precipitation: ${expected}`));
    await expect(page.locator('.hour').nth(1)).toHaveAccessibleName(/Chance of precipitation: 0%/);
  });
}

for (const scenario of [
  { code: 61, rate: 0, label: 'Rain', headline: 'Light rain' },
  { code: 63, rate: 0.8, label: 'Rain', headline: 'Rain' },
  { code: 71, rate: null, label: 'Snow', headline: 'Light snow' },
  { code: 100, rate: null, label: 'Wintry mix', headline: 'Wintry mix' },
  { code: 3, rate: 0.2, label: 'Falling', headline: 'Overcast' },
]) {
  test(`active precipitation (${scenario.code}, rate ${scenario.rate}) does not show zero percent now`, async ({ page }, testInfo) => {
    await page.addInitScript(place => localStorage.setItem('8bit-weather:v1', JSON.stringify({ selected: place, places: [place], preferences: { reducedMotion: true } })), asheville);
    await page.route('**/api/weather?**', route => {
      const raw = forecastFixture(Date.now(), scenario.code);
      raw.hourly.precipitation_probability = raw.hourly.time.map(() => 0);
      const data = apiFixture(raw, route.request().url());
      if (data.current) Object.assign(data.current, { precipitationProbability: 0, precipitationRate: scenario.rate });
      return route.fulfill({ json: data });
    });
    await page.goto('/');
    await expect(page.locator('.condition')).toHaveText(scenario.headline);
    const stat = page.getByText('Current precipitation', { exact: true }).locator('..').locator('..');
    await expect(stat).toContainText(`${scenario.label}Now`);
    await expect(stat).not.toContainText('0%');
    await expect(page.locator('.hour').first()).toHaveAccessibleName(/Precipitation:/);
    await expect(page.locator('.hour').first()).not.toHaveAccessibleName(/Chance of precipitation: 0%/);
    await expect(page.locator('.hour').nth(1)).toHaveAccessibleName(/Chance of precipitation: 0%/);
    expect(await stat.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (scenario.code === 61) await page.screenshot({ path: testInfo.outputPath('rain-now.png'), fullPage: true });
  });
}
