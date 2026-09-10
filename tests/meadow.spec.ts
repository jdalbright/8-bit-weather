import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { tokyo, forecastFixture } from '../src/test/fixtures';

async function meadow(page: Page, phase = 'day', code = 0, wind = 12) {
  const iso = { dawn:'2026-09-07T10:45:00Z', day:'2026-09-07T14:00:00Z', dusk:'2026-09-07T23:15:00Z', night:'2026-09-07T23:45:00Z' }[phase]!;
  const now = Date.parse(iso);
  await page.clock.setFixedTime(now);
  await page.addInitScript(place => localStorage.setItem('8bit-weather:v1',JSON.stringify({ selected:place,places:[place],preferences:{units:'imperial'} })), tokyo);
  const data = forecastFixture(now,code,phase === 'day' ? 1 : 0);
  data.current.time = now / 1000; data.current.wind_speed_10m=wind;
  await page.route('https://api.open-meteo.com/**', route=>route.fulfill({ contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(data) }));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'7-day forecast'})).toBeVisible();
  await expect(page.locator('.scenery')).toHaveAttribute('data-phase',phase);
  const nightOpacity = phase==='day' ? 0 : phase==='night' ? 1 : .75;
  await expect.poll(()=>page.locator('[data-art="night"]').evaluate(node=>Number(getComputedStyle(node).opacity))).toBeCloseTo(nightOpacity,2);
  await expect.poll(()=>page.locator('.art-layer').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth>0))).toBe(true);
}

for (const phase of ['dawn','day','dusk','night']) {
  test(`all weather families stay readable at ${phase}`,async({page},info)=>{
    await meadow(page,phase);
    await page.emulateMedia({reducedMotion:'reduce'});
    for (const [kind,code] of [['clear',0],['partly-cloudy',2],['cloudy',3],['fog',45],['rain',63],['snow',73],['storm',95],['unknown',123]] as const) {
      const now=await page.evaluate(()=>Date.now());
      const data=forecastFixture(now,code,phase==='day'?1:0);data.current.time=now/1000;
      await page.unroute('https://api.open-meteo.com/**');
      await page.route('https://api.open-meteo.com/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)}));
      await page.getByRole('button',{name:'Refresh',exact:true}).click();
      await expect(page.locator('.scenery')).toHaveAttribute('data-scene',`${kind}-${phase==='day'?'day':'night'}`);
      await expect(page.locator('.current-temperature')).toBeVisible();
      await expect(page.getByRole('heading',{name:'7-day forecast'})).toBeVisible();
      expect(await page.locator('.current-weather').evaluate(node=>getComputedStyle(node).textShadow)).not.toBe('none');
      if(kind==='storm'||kind==='snow'||kind==='unknown') await expect(page.locator('.meadow-birds,.meadow-fireflies')).toHaveCount(0);
      if(info.project.name==='chromium') await page.screenshot({path:`/tmp/8bit-weather-meadow-${phase}-${kind}.png`,fullPage:true});
    }
  });
}

for (const phase of ['dawn','day','dusk','night']) {
  test(`aligned art, sprites, and usable hotspots at ${phase}`,async({page},info)=>{
    await meadow(page,phase);
    for(const width of [320,390,430,1280]) {
      await page.setViewportSize({width,height:844});
      await expect.poll(()=>page.evaluate(()=>{
        const scene=document.querySelector('.scenery')!.getBoundingClientRect();
        const scale=Math.max(scene.width/960,scene.height/801);
        const x=scene.x+(scene.width-960*scale)/2, y=scene.bottom-801*scale;
        const indicator=document.querySelector('.station-indicator')!.getBoundingClientRect();
        const hub=document.querySelector('.station-hub')!.getBoundingClientRect();
        const layers=[...document.querySelectorAll('.art-layer')].map(node=>node.getBoundingClientRect());
        const buttons=[...document.querySelectorAll('.scene-hotspot')].map(node=>node.getBoundingClientRect());
        return Math.max(Math.abs(indicator.x+indicator.width/2-(x+229*scale)),Math.abs(indicator.y+indicator.height/2-(y+579*scale)),
          Math.abs(hub.x+hub.width/2-(x+195*scale)),Math.abs(hub.y+hub.height/2-(y+511*scale)),
          ...layers.flatMap(r=>[Math.abs(r.x-x),Math.abs(r.y-y)]),
          ...buttons.flatMap(r=>[Math.max(0,44-r.width),Math.max(0,44-r.height),Math.max(0,scene.left-r.left),Math.max(0,r.right-scene.right)]));
      })).toBeLessThan(.5);
      await expect(page.getByRole('button',{name:'Make a river ripple'})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      if(info.project.name==='chromium'&&width===390) await page.screenshot({path:`/tmp/8bit-weather-meadow-${phase}.png`,fullPage:true});
    }
  });
}

test('discoveries work by tap and keyboard without enabling sound or moving the page',async({page})=>{
  await meadow(page);
  const before=await page.evaluate(()=>scrollY);
  await page.getByRole('button',{name:'Make a river ripple'}).click();
  await expect(page.locator('.river-discovery')).toBeVisible();
  await expect(page.getByRole('button',{name:'Sound off',exact:true})).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>scrollY)).toBe(before);
  await page.getByRole('button',{name:'Blink the weather station light'}).focus();
  await expect(page.locator('.river-discovery')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.locator('.indicator-active')).toBeVisible();
  await expect(page.getByRole('button',{name:'Blink the weather station light'})).toBeFocused();
});

test('reduced motion keeps static feedback and all new effects stop offscreen and hidden',async({page})=>{
  await page.setViewportSize({width:390,height:400});
  await meadow(page,'night',63);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await expect(page.locator('.scenery')).toHaveAttribute('data-in-view','false');
  expect(await page.locator('.landscape').evaluate(node=>node.getAnimations({subtree:true}).every(a=>a.playState==='paused'||a.playState==='finished'))).toBe(true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.scenery')).toHaveAttribute('data-in-view','true');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.scenery')).toHaveAttribute('data-animate','false');
  await page.getByRole('button',{name:'Make a river ripple'}).click();
  await expect(page.locator('.river-discovery')).toBeVisible();
  expect(await page.locator('.river-discovery').evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('.river-discovery')).toHaveCount(0);
});

test('weather changes adjust wind and precipitation while keeping wildlife out of storms and snow',async({page})=>{
  await meadow(page,'day',0,0);
  await expect(page.locator('.scenery')).toHaveAttribute('data-calm','true');
  const calm=await page.locator('.scene-cloud').first().evaluate(node=>getComputedStyle(node).animationDuration);
  for(const code of [65,75,95]) {
    const data=forecastFixture(Date.parse('2026-09-07T14:00:00Z'),code,1); data.current.wind_speed_10m=40;
    await page.unroute('https://api.open-meteo.com/**');
    await page.route('https://api.open-meteo.com/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)}));
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await expect(page.locator('.scenery')).toHaveAttribute('data-calm','false');
    await expect(page.locator('.scenery')).toHaveAttribute('data-scene',`${code===65?'rain':code===75?'snow':'storm'}-day`);
    expect(await page.locator('.precipitation i').count()).toBeLessThanOrEqual(28);
    expect(await page.locator('.scene-cloud').first().evaluate(node=>parseFloat(getComputedStyle(node).animationDuration))).toBeLessThan(parseFloat(calm));
    if(code!==65) await expect(page.locator('.meadow-birds,.meadow-fireflies')).toHaveCount(0);
  }
});

test('welcome crop keeps both discovery targets fully usable',async({page})=>{
  await page.goto('/');
  for(const width of [320,390,430,1280]) {
    await page.setViewportSize({width,height:844});
    await page.getByRole('button',{name:'Blink the weather station light'}).click();
    await expect(page.locator('.indicator-active')).toBeVisible();
    const target=await page.getByRole('button',{name:'Blink the weather station light'}).boundingBox();
    expect(target!.width).toBe(44);expect(target!.x).toBeGreaterThanOrEqual(0);
    await expect(page.locator('.indicator-active')).toHaveCount(0);
  }
});

test('the Now icon follows sunset even before the next provider day/night update',async({page})=>{
  await meadow(page,'dusk');
  const now=Date.parse('2026-09-07T23:15:00Z');
  const data=forecastFixture(now,0,1);data.current.time=now/1000-15*60;
  await page.unroute('https://api.open-meteo.com/**');
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)}));
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.locator('.scenery')).toHaveAttribute('data-scene','clear-night');
  const moon=await page.locator('.celestial').innerHTML();
  await expect.poll(()=>page.locator('.hour').first().locator('.weather-icon').innerHTML()).toBe(moon);
});
