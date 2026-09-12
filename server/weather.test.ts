import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { handleWeather, resetWeatherCache } from './weather';
import { codedWeather, currentFrom, daysFrom, hoursFrom, rainFrom } from '../src/lib/xweather';
import { precipitationForHour } from '../src/lib/weather';
const now = Date.parse('2026-09-11T14:00:00Z');
function raw(overrides: Record<string,unknown> = {}) { return {success:true,response:[{profile:{tz:'America/New_York'},periods:[{timestamp:now/1000,tempC:24,feelslikeC:25,humidity:60,pop:0,windSpeedKPH:5,isDay:true,sky:90,cloudsCoded:'BK',weatherPrimaryCoded:':L:R',precipRateMM:0,precipMM:0,uvi:4,...overrides}]}]}; }
function request(section='current',extra='') { return new Request(`https://example.com/api/weather?latitude=35.78&longitude=-78.64&section=${section}${extra}`); }
beforeEach(()=> {resetWeatherCache();vi.useFakeTimers();vi.setSystemTime(now);vi.stubEnv('XWEATHER_CLIENT_ID','test-id');vi.stubEnv('XWEATHER_CLIENT_SECRET','test-secret');});
afterEach(()=> {vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('Xweather condition interpretation',()=> {
 it.each([0,21,100,null])('retains the current conditions probability independently from hourly forecasts: %s', pop => {
  expect(currentFrom(raw({pop})).precipitationProbability).toBe(pop);
 });
 it.each([-1,101,'0',undefined])('keeps invalid current probability unavailable: %s', pop => {
  expect(currentFrom(raw({pop})).precipitationProbability).toBeNull();
 });
 it('resolves explicit dry rain and preserves active or missing-rate rain',()=> {
  expect(currentFrom(raw()).code).toBe(3);
  expect(currentFrom(raw({precipRateMM:0.3})).code).toBe(61);
  expect(currentFrom(raw({precipRateMM:null})).code).toBe(61);
 });
 it.each(['C','S','L','VC','IS','SC'])('does not animate %s precipitation without local evidence',coverage=> {
  const result=currentFrom(raw({weatherPrimaryCoded:`${coverage}:L:R`,precipRateMM:null}));
  expect(result.code).toBe(3);expect(result.conditionLabel).toBe('Overcast');
 });
 it.each(['C','S','L','VC','IS','SC'])('uses cloud conditions for %s thunderstorms without local precipitation evidence', coverage => {
  for (const precipRateMM of [0, null]) {
   expect(currentFrom(raw({ weatherPrimaryCoded: `${coverage}::T`, precipRateMM, pop: 0 }))).toMatchObject({ code: 3, conditionLabel: 'Overcast' });
  }
 });
 it('keeps active storms and unavailable clouds distinct from dry cloud conditions', () => {
  expect(currentFrom(raw({weatherPrimaryCoded:'C::T',precipRateMM:1}))).toMatchObject({code:95,conditionLabel:'Thunderstorms'});
  expect(currentFrom(raw({weatherPrimaryCoded:'VC::T',precipRateMM:1}))).toMatchObject({code:3,conditionLabel:'Overcast'});
  expect(currentFrom(raw({weatherPrimaryCoded:'C::T',sky:null,cloudsCoded:null}))).toMatchObject({code:null,conditionLabel:'Conditions unavailable'});
 });
 it.each([[':L:S',71],[':H:ZR',67],[':L:ZL',56],['::T',95],['::WM',100],['::IP',101],['::UP',null]])('preserves %s', (code,wmo)=>expect(currentFrom(raw({weatherPrimaryCoded:code})).code).toBe(wmo));
 it('retains day/night and maps unknown codes safely',()=> {
  expect(currentFrom(raw({weatherPrimaryCoded:'::CL',isDay:false})).conditionLabel).toBe('Clear night');
  expect(codedWeather('::invalid').code).toBeNull();
 });
 it('normalizes hourly POP intervals and solar days without shifting temperatures',()=> {
  const data=raw({pop:70,sunrise:now/1000-3600,sunset:false,maxTempC:28,minTempC:17});
  data.response[0].periods.push({...data.response[0].periods[0],timestamp:now/1000+3600,pop:10});
  expect(hoursFrom(data)[1]).toMatchObject({time:now/1000+3600,precipitation:70,temperature:24});
  expect(daysFrom(data)[0]).toMatchObject({date:'2026-09-11',sunset:null,high:28,low:17});
 });
 it('keeps one-minute amounts and excludes frozen precipitation',()=> {
  expect(rainFrom(raw({precipMM:0.02}))[0]).toMatchObject({time:now/1000+60,amount:0.02,interval:60});
  expect(rainFrom(raw({weatherPrimaryCoded:'::S',precipMM:0.2}))[0].amount).toBeNull();
 });
});

it('includes the current hour when the history range end is exclusive', async () => {
  vi.setSystemTime(Date.parse('2026-09-12T00:50:00Z'));
  vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
    const data = raw();
    const start = Number(url.searchParams.get('from'));
    const end = Number(url.searchParams.get('to'));
    data.response[0].periods = Array.from({ length: Math.ceil((end-start)/3600) }, (_, i) => ({ ...data.response[0].periods[0], timestamp: start+i*3600 }));
    return Response.json(data);
  }));
  const response = await handleWeather(request('history', '&timezone=America%2FNew_York'));
  const data = await response.json();
  expect(data.hourly).toHaveLength(21);
  expect(data.hourly.at(-1).time).toBe(Date.parse('2026-09-12T00:00:00Z')/1000);
});
describe('weather endpoint',()=> {
 it.each(['2026-09-12T00:50:00Z', '2026-11-01T06:30:00Z', '2026-03-08T07:30:00Z'])('provides this-hour probability at %s', async instant => {
  vi.setSystemTime(Date.parse(instant));
  const hour = Math.floor(Date.parse(instant)/3600000)*3600;
  vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
    const data = raw();
    if (url.searchParams.get('filter') === '1hr') {
      // Model the live default: without an explicit start, the first period is
      // next hour. Probability 37 belongs to the requested starting hour.
      const start = Number(url.searchParams.get('from') ?? hour+3600);
      data.response[0].periods = Array.from({length:49}, (_, i) => ({...data.response[0].periods[0], timestamp:start+i*3600, pop:i ? 12 : 37}));
    }
    return Response.json(data);
  }));
  const response = await handleWeather(request('forecast'));
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(precipitationForHour(data.hourly, hour)).toBe(37);
  expect(precipitationForHour(data.hourly, hour+3600)).toBe(12);
  expect(data.hourly.at(-1).time).toBe(hour+48*3600);
 });
 it('keeps credentials upstream and shares cached requests across callers',async()=> {
  const fetcher=vi.fn(async(...args: unknown[])=> { void args; return Response.json(raw()); });vi.stubGlobal('fetch',fetcher);
  const [a,b]=await Promise.all([handleWeather(request()),handleWeather(request())]);
  expect(a.status).toBe(200);expect(b.status).toBe(200);expect(fetcher).toHaveBeenCalledTimes(1);
  const body=await a.text();expect(body).not.toContain('test-secret');expect(body).not.toContain('client_id');
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('client_secret')).toBe('test-secret');
  await handleWeather(request());expect(fetcher).toHaveBeenCalledTimes(1);
  vi.setSystemTime(now+600001);await handleWeather(request());expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('reuses an hourly forecast while current conditions refresh',async()=> {
  const fetcher=vi.fn(async(...args: unknown[])=> { void args; return Response.json(raw()); });vi.stubGlobal('fetch',fetcher);
  await handleWeather(request('forecast'));expect(fetcher).toHaveBeenCalledTimes(2);
  vi.setSystemTime(now+600001);await handleWeather(request('forecast'));expect(fetcher).toHaveBeenCalledTimes(2);
  await handleWeather(request());expect(fetcher).toHaveBeenCalledTimes(3);
 });
 it('backs off account-wide after provider quota exhaustion',async()=> {
  const fetcher=vi.fn(async()=>new Response('',{status:429,headers:{'Retry-After':'120'}}));vi.stubGlobal('fetch',fetcher);
  const response=await handleWeather(request());expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('120');
  await handleWeather(request('rain'));expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it.each([
  { first: 'http', firstSeconds: 3600, second: 'http', secondSeconds: 60 },
  { first: 'body', firstSeconds: 3600, second: 'http', secondSeconds: 60 },
  { first: 'http', firstSeconds: 7200, second: 'body', secondSeconds: 3600 },
 ])('preserves a longer $first cooldown when a later $second response arrives', async scenario => {
  let resolveFirst!: (response: Response) => void;
  let resolveSecond!: (response: Response) => void;
  const fetcher = vi.fn()
    .mockImplementationOnce(() => new Promise<Response>(resolve => { resolveFirst = resolve; }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { resolveSecond = resolve; }))
    .mockImplementation(async () => Response.json(raw()));
  vi.stubGlobal('fetch', fetcher);
  const quota = (kind: string, seconds: number) => kind === 'body'
    ? Response.json({ success: false, error: { code: 'maxhits_day' } })
    : new Response('', { status: 429, headers: { 'Retry-After': String(seconds) } });
  const first = handleWeather(request('current'));
  const second = handleWeather(request('rain'));
  expect(fetcher).toHaveBeenCalledTimes(2);
  resolveFirst(quota(scenario.first, scenario.firstSeconds));
  expect((await first).headers.get('Retry-After')).toBe(String(scenario.firstSeconds));

  vi.setSystemTime(now + 5000);
  resolveSecond(quota(scenario.second, scenario.secondSeconds));
  const later = await second;
  expect(later.status).toBe(429);
  expect(later.headers.get('Retry-After')).toBe(String(scenario.firstSeconds - 5));

  // The shorter provider limit has expired, but the account's longer one has not.
  vi.setSystemTime(now + (scenario.secondSeconds + 6) * 1000);
  const blocked = await handleWeather(request('current'));
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get('Retry-After')).toBe(String(scenario.firstSeconds - scenario.secondSeconds - 6));
  expect(fetcher).toHaveBeenCalledTimes(2);

  vi.setSystemTime(now + scenario.firstSeconds * 1000 + 1);
  expect((await handleWeather(request('current'))).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(3);
 });
 it('validates coordinates, origins, configuration and canonical routing',async()=> {
  expect((await handleWeather(new Request('https://example.com/api/weather?latitude=999&longitude=0&section=current'))).status).toBe(400);
  expect((await handleWeather(new Request(request(),{headers:{Origin:'https://evil.example'}}))).status).toBe(403);
  expect((await handleWeather(new Request('https://example.com/api/weather.ts'))).status).toBe(404);
  vi.stubEnv('XWEATHER_CLIENT_SECRET','');expect((await handleWeather(request())).status).toBe(503);
 });
 it('allows native origins and rejects incomplete upstream responses',async()=> {
  vi.stubEnv('WEATHER_NATIVE_ORIGINS','capacitor://localhost');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,response:[]})));
  const response=await handleWeather(new Request(request(),{headers:{Origin:'capacitor://localhost'}}));
  expect(response.status).toBe(503);expect(response.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost');
 });
 it('bounds per-IP requests even on cache hits',async()=> {
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(raw())));
  for(let i=0;i<60;i++) await handleWeather(request());
  expect((await handleWeather(request())).status).toBe(429);
 });
});

it.each([
  ['2026-11-01T16:00:00Z','America/New_York','2026-11-01T04:00:00Z'],
  ['2026-03-08T16:00:00Z','America/New_York','2026-03-08T05:00:00Z'],
  ['2026-09-11T14:00:00Z','Asia/Kathmandu','2026-09-10T18:15:00Z'],
])('starts history at the true local midnight for %s %s',async(instant,zone,start)=> {
  vi.setSystemTime(Date.parse(instant));
  const urls: URL[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url:URL)=> {urls.push(url);return Response.json(raw());}));
  const response=await handleWeather(request('history',`&timezone=${encodeURIComponent(zone)}`));
  expect(response.status).toBe(200);
  expect(Number(urls[0].searchParams.get('from'))).toBe(Date.parse(start)/1000);
});
