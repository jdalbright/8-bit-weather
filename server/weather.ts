import { createHash } from 'node:crypto';
import { currentFrom, daysFrom, hoursFrom, rainFrom, timezone, type WeatherPart, type WeatherSection } from '../src/lib/xweather.js';
import { localDate } from '../src/lib/weather.js';
const TTL = { current: 600, rain: 600, forecast: 3600, history: 3600 };
const cache = new Map<string, WeatherPart>();
const pending = new Map<string, Promise<WeatherPart>>();
const limits = new Map<string, { count: number; until: number }>();
let retryAt = 0;
class ProviderError extends Error { constructor(public status: number, public retry = 60) { super('weather_unavailable'); } }
export function resetWeatherCache() { cache.clear(); pending.clear(); limits.clear(); retryAt = 0; }
async function provider(path: string, params: Record<string,string>): Promise<unknown> {
  if (Date.now() < retryAt) throw new ProviderError(429, Math.ceil((retryAt-Date.now())/1000));
  const url = new URL(`https://data.api.xweather.com/${path}`);
  url.search = new URLSearchParams({ ...params, client_id: process.env.XWEATHER_CLIENT_ID!, client_secret: process.env.XWEATHER_CLIENT_SECRET! }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (response.status === 429) {
    const header = response.headers.get('retry-after');
    const seconds = Number(header);
    const retry = Math.max(60, header && Number.isFinite(seconds) ? seconds : header && Number.isFinite(Date.parse(header)) ? (Date.parse(header)-Date.now())/1000 : 3600);
    retryAt = Date.now()+retry*1000; throw new ProviderError(429,Math.ceil(retry));
  }
  if (!response.ok) throw new ProviderError(503);
  const raw = await response.json();
  if (!raw?.success) {
    if (['maxhits','maxhits_day','maxhits_month','rate_limit'].includes(raw?.error?.code)) { retryAt = Date.now()+3600000; throw new ProviderError(429,3600); }
    throw new ProviderError(502);
  }
  return raw;
}
async function load(section: WeatherSection, lat: number, lon: number, tz?: string): Promise<WeatherPart> {
  const key = `${lat},${lon}/${section}/${tz ?? ''}`;
  const old = cache.get(key);
  if (old && Date.now() < old.expiresAt) return old;
  const existing = pending.get(key); if (existing) return existing;
  const job = (async () => {
    const location = `${lat},${lon}`, now = Date.now();
    let part: Partial<WeatherPart>;
    let zone: string;
    if (section === 'forecast') {
      // Include the hour in progress: the default starts at the next hour and
      // leaves its preceding probability interval unavailable after normalization.
      const from = String(Math.floor(now / 3600000) * 3600);
      const [hourly,daily] = await Promise.all([provider(`forecasts/${location}`, { filter:'1hr', limit:'49', from }),provider(`forecasts/${location}`, { filter:'day', limit:'7' })]);
      zone = timezone(daily); part = { hourly: hoursFrom(hourly), daily: daysFrom(daily) };
      if (!part.hourly?.length || !part.daily?.length) throw new ProviderError(502);
    } else if (section === 'history') {
      zone = tz!;
      const today = localDate(now,zone);
      // Find the actual local-day boundary, including DST and quarter-hour zones.
      let low = Math.floor(now/1000)-36*3600, start = Math.floor(now/1000);
      while (start-low>1) {
        const middle=Math.floor((low+start)/2);
        if (localDate(middle*1000,zone) === today) start=middle; else low=middle;
      }
      // Xweather's range end is exclusive; include the current hourly sample.
      const end=start+Math.floor((now/1000-start)/3600)*3600+1;
      const raw = await provider(`conditions/${location}`, { from:String(start), to:String(end) });
      part = { hourly: hoursFrom(raw) };
    } else {
      const raw = await provider(`conditions/${location}`, section === 'rain' ? {filter:'minutelyprecip,1min',limit:'60'} : {});
      zone = timezone(raw); part = section === 'current' ? {current:currentFrom(raw)} : {minutely:rainFrom(raw)};
    }
    const result: WeatherPart = { provider:'xweather', latitude:lat, longitude:lon, timezone:zone, updatedAt:now, expiresAt:now+TTL[section]*1000, ...part };
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(key,result); return result;
  })();
  pending.set(key,job);
  try { return await job; } finally { pending.delete(key); }
}
export async function handleWeather(request: Request): Promise<Response> {
  const url = new URL(request.url), origin = request.headers.get('origin');
  const allowed = (process.env.WEATHER_NATIVE_ORIGINS ?? '').split(',').map(v=>v.trim()).filter(v=>v && v !== '*' && v !== 'null');
  const headers: Record<string,string> = { 'Cache-Control':'no-store', Vary:'Origin' };
  if (origin && origin !== url.origin && !allowed.includes(origin)) return Response.json({code:'invalid_origin'},{status:403,headers});
  if (origin && allowed.includes(origin)) Object.assign(headers, {'Access-Control-Allow-Origin':origin,'Access-Control-Expose-Headers':'Retry-After','Access-Control-Allow-Methods':'GET, OPTIONS'});
  const json = (data: unknown,status=200) => Response.json(data,{status,headers});
  if (url.pathname !== '/api/weather') return json({code:'not_found'},404);
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (request.method !== 'GET') return json({code:'method_not_allowed'},405);
  const section = url.searchParams.get('section') as WeatherSection;
  const latitude = url.searchParams.get('latitude'), longitude = url.searchParams.get('longitude');
  const lat=Number(latitude),lon=Number(longitude),tz=url.searchParams.get('timezone') ?? undefined;
  if (!(section in TTL) || !Object.hasOwn(TTL,section) || !latitude?.trim() || !longitude?.trim() || !Number.isFinite(lat) || Math.abs(lat)>90 || !Number.isFinite(lon) || Math.abs(lon)>180
    || [...url.searchParams.keys()].some(k=>!['section','latitude','longitude','timezone'].includes(k))) return json({code:'invalid_request'},400);
  if (section === 'history') { try { if (!tz || tz.length>80) throw new Error(); new Intl.DateTimeFormat('en',{timeZone:tz}); } catch { return json({code:'invalid_timezone'},400); } }
  if (!process.env.XWEATHER_CLIENT_ID || !process.env.XWEATHER_CLIENT_SECRET) return json({code:'weather_unconfigured'},503);
  // Bounded per-instance protection; the deployed firewall provides the shared IP limit.
  const ip = createHash('sha256').update(request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local').digest('hex');
  const now=Date.now();
  for (const [k,v] of limits) if (v.until<=now) limits.delete(k);
  const count=limits.get(ip) ?? {count:0,until:now+60000};
  if (++count.count>60) { headers['Retry-After']='60'; return json({code:'rate_limited'},429); }
  if(limits.size>=2048) limits.delete(limits.keys().next().value!); limits.set(ip,count);
  try {
    const data=await load(section,Number(lat.toFixed(4)),Number(lon.toFixed(4)),tz);
    headers['Cache-Control']='public, max-age=0, must-revalidate';
    headers['Vercel-CDN-Cache-Control']=`public, s-maxage=${Math.max(1,Math.floor((data.expiresAt-Date.now())/1000))}`;
    return json(data);
  } catch (error) {
    const status=error instanceof ProviderError ? error.status : 503;
    headers['Retry-After']=String(error instanceof ProviderError ? error.retry : 60);
    return json({code:status===429 ? 'weather_quota' : 'weather_unavailable'},status);
  }
}
