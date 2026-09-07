import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { asheville, forecastFixture, tokyo } from '../src/test/fixtures';

const prefs = { units: 'imperial', music: true, ambience: true, effects: true, musicVolume: .35, ambienceVolume: .25, effectsVolume: .4, reducedMotion: true };
const key = '8bit-weather:v1';
const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
async function seed(page: Page) {
  await page.addInitScript(({ key, place, prefs }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ preferences: prefs, places: [place], selected: place })); }, { key, place: asheville, prefs });
}
async function mockForecast(page: Page, code = 1, isDay = 1) {
  // Explicit provider day/night fixtures; solar-clock behavior has its own fixed-time suite.
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ headers, body: JSON.stringify({ ...forecastFixture(Date.now(), code, isDay), daily: { ...forecastFixture(Date.now()).daily, sunrise:[], sunset:[] } }) }));
}
async function mockCities(page: Page) {
  await page.route('https://geocoding-api.open-meteo.com/**', route => {
    const query = new URL(route.request().url()).searchParams.get('name') ?? '';
    const place = query.toLowerCase().includes('tok') ? tokyo : asheville;
    return route.fulfill({ headers, body: JSON.stringify({ results: [{ ...place, admin1: place.region }] }) });
  });
}
async function loaded(page: Page) { await expect(page.getByRole('heading', { name: '7-day forecast' })).toBeVisible(); }

test('starts with location selection and never invents a forecast', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Find your weather' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use my location' })).toBeVisible();
  await expect(page.locator('.current-temperature')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('searches, saves, switches places, changes units, and persists choices', async ({ page }) => {
  let requests = 0;
  await mockCities(page); await page.route('https://api.open-meteo.com/**', route => { requests++; return route.fulfill({ headers, body: JSON.stringify(forecastFixture(Date.now())) }); });
  await page.goto('/'); await page.getByRole('button', { name: 'Search for a city' }).click();
  await page.getByRole('searchbox', { name: 'Find a city' }).fill('Asheville');
  await page.getByRole('button', { name: 'Asheville North Carolina, United States', exact: true }).click();
  await loaded(page); expect(requests).toBe(1); await expect(page.locator('.day-row')).toHaveCount(7); await expect(page.locator('.hour')).toHaveCount(24);
  await expect(page.getByRole('heading', {name:'72° Fahrenheit'})).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: '°C / km/h', exact: true }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', {name:'22° Celsius'})).toBeVisible(); expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Places', exact: true }).click();
  await expect(page.getByRole('button', {name:'Remove Asheville from saved places'})).toBeVisible();
  await page.getByRole('searchbox', {name:'Find a city'}).fill('Tokyo');
  await page.getByRole('button', {name:'Tokyo Tokyo, Japan',exact:true}).click(); await loaded(page);
  await expect(page.getByRole('button', {name:'Change location, Tokyo'})).toBeVisible();
  await page.reload(); await loaded(page); await expect(page.getByRole('heading', {name:'22° Celsius'})).toBeVisible();
  await page.getByRole('button', {name:'Places',exact:true}).click();
  await page.getByRole('button', {name:'Remove Asheville from saved places'}).click();
  await expect(page.getByRole('button', {name:'Remove Asheville from saved places'})).toHaveCount(0);
});

test('uses permitted geolocation with a current-location label', async ({ page, context }) => {
  await mockForecast(page); await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: 35.5951, longitude: -82.5515 });
  await page.goto('/'); await page.getByRole('button', { name: 'Use my location' }).click();
  await loaded(page); await expect(page.getByRole('button', {name:'Change location, Current location'})).toBeVisible();
});

test('location denial and timeout keep manual search available', async ({ page }) => {
  await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_success, error) => error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); });
  await page.goto('/'); await page.getByRole('button', {name:'Use my location'}).click();
  await expect(page.getByRole('alert')).toContainText('Location permission is off');
  await expect(page.getByRole('button', {name:'Search for a city'})).toBeEnabled();
  await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (_success, error) => error?.({ code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); });
  await page.getByRole('button', {name:'Use my location'}).click();
  await expect(page.getByRole('alert')).toContainText('took too long');
});

test('retains cached weather on refresh failure, shows offline state, and reconnects', async ({ page, context }) => {
  await seed(page); await mockForecast(page); await page.goto('/'); await loaded(page);
  await page.unroute('https://api.open-meteo.com/**');
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({status:503,headers,body:'unavailable'}));
  await page.getByRole('button', {name:'Refresh',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('taking a break'); await expect(page.getByRole('heading', {name:'72° Fahrenheit'})).toBeVisible();
  await context.setOffline(true); await expect(page.getByText('You’re offline. Showing your saved forecast.', {exact:true})).toBeVisible();
  await page.unroute('https://api.open-meteo.com/**'); await mockForecast(page); await context.setOffline(false);
  await page.getByRole('button', {name:'Refresh',exact:true}).click(); await expect(page.getByRole('alert')).toHaveCount(0);
});

test('expired cache is visibly old and never invents future rows', async ({ page, context }) => {
  await seed(page); await mockForecast(page); await page.goto('/'); await loaded(page);
  await page.evaluate(key => {
    const snapshots = JSON.parse(localStorage.getItem(`${key}:forecasts`)!);
    for (const s of snapshots) { s.fetchedAt -= 10 * 86400000; s.current.time -= 10 * 86400; s.hourly.forEach((h: {time:number}) => h.time -= 10 * 86400); s.daily.forEach((d: {time:number;date:string}) => { d.time -= 10 * 86400; d.date = new Date(d.time * 1000).toISOString().slice(0,10); }); }
    localStorage.setItem(`${key}:forecasts`, JSON.stringify(snapshots));
  }, key);
  await context.setOffline(true);
  // Navigate away and back to remount the weather view without relying on a network reload.
  await page.getByRole('button', {name:'Places',exact:true}).click();
  await page.getByRole('button', {name:'Asheville North Carolina, United States',exact:true}).click();
  await expect(page.getByText('This hourly forecast has expired.',{exact:false})).toBeVisible();
  await expect(page.locator('.day-row')).toHaveCount(0);
  await expect(page.getByText('Updated 10 days ago',{exact:true})).toBeVisible();
});

test('sound requires a tap, controls persist, and hidden pages suspend audio', async ({ page }) => {
  await seed(page); await mockForecast(page);
  await page.addInitScript(() => {
    const Audio = window.AudioContext;
    const contexts: AudioContext[] = [];
    Object.assign(window, { __weatherTestAudio: contexts });
    window.AudioContext = class extends Audio { constructor(options?: AudioContextOptions) { super(options); contexts.push(this); } };
  });
  await page.goto('/'); await loaded(page);
  expect(await page.evaluate(() => (window as unknown as {__weatherTestAudio: AudioContext[]}).__weatherTestAudio.length)).toBe(0);
  await page.getByRole('button', {name:'Sound off',exact:true}).click();
  await expect(page.getByRole('button', {name:'Sound on',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(() => (window as unknown as {__weatherTestAudio: AudioContext[]}).__weatherTestAudio[0].state)).toBe('running');
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.evaluate(() => (window as unknown as {__weatherTestAudio: AudioContext[]}).__weatherTestAudio[0].state)).toBe('suspended');
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:false}); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.evaluate(() => (window as unknown as {__weatherTestAudio: AudioContext[]}).__weatherTestAudio[0].state)).toBe('running');
  await page.getByRole('button', {name:'Settings',exact:true}).click();
  await page.getByRole('switch', {name:'Music',exact:true}).click();
  await expect(page.getByRole('slider', {name:'Music volume',exact:true})).toBeDisabled();
  await page.getByRole('slider', {name:'Weather ambience volume',exact:true}).fill('63');
  await page.reload(); await page.getByRole('button', {name:'Settings',exact:true}).click();
  await expect(page.getByRole('switch', {name:'Music',exact:true})).toHaveAttribute('aria-checked','false');
  await expect(page.getByRole('slider', {name:'Weather ambience volume',exact:true})).toHaveValue('63');
  await expect(page.getByRole('banner').getByRole('button', {name:'Sound off',exact:true})).toBeVisible();
});

test('installation help and clearing saved data work', async ({ page }) => {
  await seed(page); await mockForecast(page); await page.goto('/'); await loaded(page);
  await page.getByRole('button', {name:'Settings',exact:true}).click();
  await page.getByRole('button', {name:/How to install|Install app/,exact:true}).click();
  // Native Chromium installation prompts are tested separately; manual guidance must always be available when unsupported.
  await page.getByRole('button', {name:'Clear saved data',exact:true}).click();
  await page.getByRole('button', {name:'Keep my data',exact:true}).click();
  await expect(page.getByRole('button', {name:'Clear everything',exact:true})).toHaveCount(0);
  await page.getByRole('button', {name:'Clear saved data',exact:true}).click();
  await page.getByRole('button', {name:'Clear everything',exact:true}).click();
  await expect(page.getByRole('heading', {name:'Find your weather'})).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).selected,key)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(`${key}:forecasts`),key)).toBeNull();
});

for (const [name, code, isDay] of [['clear',0,1],['partly-cloudy',2,1],['cloudy',3,1],['fog',45,1],['rain',63,1],['snow',73,1],['storm',95,1],['night',0,0]] as const) {
  test(`renders ${name} scenery with accessible motion controls`, async ({ page }, testInfo) => {
    await seed(page); await mockForecast(page,code,isDay); await page.goto('/'); await loaded(page);
    await expect(page.locator('.scenery')).toHaveAttribute('data-scene',`${name === 'night' ? 'clear' : name}-${isDay ? 'day' : 'night'}`);
    await expect(page.locator('.scenery')).toHaveAttribute('data-animate','false');
    expect(await page.locator('.landscape-art').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    if (testInfo.project.name === 'chromium' && ['clear','rain','snow','night'].includes(name)) {
      await page.screenshot({path:`/tmp/8bit-weather-${name}-390.png`,fullPage:true});
    }
  });
}

for (const width of [320,390,430,1280]) {
  test(`layout fits ${width}px without clipped controls or page overflow`, async ({page}, testInfo) => {
    await page.setViewportSize({width,height:844}); await seed(page); await mockForecast(page); await page.goto('/'); await loaded(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const badButtons = await page.locator('button').evaluateAll(buttons => buttons.filter(button => { const r = button.getBoundingClientRect(); return r.width > 0 && (r.height < 43.9 || r.width < 43.9); }).map(button=>({name:button.textContent,size:button.getBoundingClientRect().toJSON()})));
    expect(badButtons).toEqual([]);
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Today',exact:true}).click();
    if (testInfo.project.name === 'chromium') await page.screenshot({path:`/tmp/8bit-weather-layout-${width}.png`,fullPage:true});
  });
}

test('production PWA has valid icons and opens offline after installation caching', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Service worker installation is verified in Chromium; physical iOS installation is a separate device check.');
  await seed(page); await mockForecast(page); await page.goto('/'); await loaded(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await loaded(page);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
  expect(manifest.display).toBe('standalone'); expect(manifest.icons.some((icon:{sizes:string})=>icon.sizes==='192x192')).toBe(true); expect(manifest.icons.some((icon:{purpose:string})=>icon.purpose==='maskable')).toBe(true);
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
  await context.setOffline(true); await page.reload(); await loaded(page);
  await expect(page.getByText('You’re offline. Showing your saved forecast.',{exact:true})).toBeVisible();
  expect(await page.locator('.landscape-art').evaluate((image: HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
});
