import { expect, test } from '@playwright/test';
import { apiFixture, asheville, forecastFixture } from '../src/test/fixtures';

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
