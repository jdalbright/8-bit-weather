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
