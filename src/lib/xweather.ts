import type { CurrentWeather, DayWeather, HourWeather, RainWeather } from '../types';
import { currentWeatherInfo, localDate, weatherInfo } from './weather.js';

export type WeatherSection = 'current' | 'forecast' | 'rain' | 'history';
export interface WeatherPart {
  provider: 'xweather'; latitude: number; longitude: number; timezone: string;
  updatedAt: number; expiresAt: number;
  current?: CurrentWeather; hourly?: HourWeather[]; daily?: DayWeather[]; minutely?: RainWeather[];
}
type Obj = Record<string, unknown>;
export const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
export const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const positive = (v: unknown) => number(v) !== null && (v as number) >= 0 ? v as number : null;
const percent = (v: unknown) => positive(v) !== null && (v as number) <= 100 ? v as number : null;
const cloud = (p: Obj): number | null => {
  const codes: Record<string, number> = { CL: 0, FW: 1, SC: 2, BK: 3, OV: 3 };
  if (typeof p.cloudsCoded === 'string' && p.cloudsCoded in codes) return codes[p.cloudsCoded];
  const sky = percent(p.sky);
  return sky === null ? null : sky < 7 ? 0 : sky < 32 ? 1 : sky < 70 ? 2 : 3;
};
export function codedWeather(value: unknown): { code: number | null; coverage: string } {
  if (typeof value !== 'string') return { code: null, coverage: '' };
  const [coverage, intensity, wx] = value.split(':');
  const i = ['VL', 'L'].includes(intensity) ? 0 : ['H', 'VH'].includes(intensity) ? 2 : 1;
  const codes: Record<string, number[]> = { CL:[0], FW:[1], SC:[2], BK:[3], OV:[3], F:[45], BR:[45], IF:[48], ZF:[48],
    L:[51,53,55], R:[61,63,65], RW:[80,81,82], ZL:[56,56,57], ZR:[66,66,67],
    S:[71,73,75], SW:[85,85,86], BS:[71,73,75], IC:[77], IP:[101], RS:[100], SI:[100], WM:[100], A:[102], T:[95], TO:[95], FC:[95], WP:[95] };
  return { code: codes[wx]?.[Math.min(i, (codes[wx]?.length ?? 1)-1)] ?? null, coverage: coverage ?? '' };
}
function root(raw: unknown): Obj {
  const r = obj(raw);
  if (r.success !== true) throw new Error('provider_response');
  const data = Array.isArray(r.response) ? obj(r.response[0]) : obj(r.response);
  if (!Array.isArray(data.periods)) throw new Error('provider_response');
  return data;
}
export function periods(raw: unknown): Obj[] {
  return (root(raw).periods as unknown[]).map(obj).filter(p => positive(p.timestamp) !== null).sort((a,b) => (a.timestamp as number)-(b.timestamp as number));
}
export function timezone(raw: unknown): string {
  const tz = obj(root(raw).profile).tz;
  if (typeof tz !== 'string') throw new Error('provider_timezone');
  new Intl.DateTimeFormat('en', { timeZone: tz });
  return tz;
}
export function currentFrom(raw: unknown): CurrentWeather {
  const p = periods(raw)[0];
  if (!p || typeof p.isDay !== 'boolean') throw new Error('provider_current');
  const wx = codedWeather(p.weatherPrimaryCoded ?? p.weatherCoded);
  let code = wx.code;
  const rate = positive(p.precipRateMM);
  const qualified = ['C','S','L','IS','SC','VC','PA'].includes(wx.coverage);
  const ordinaryRain = code !== null && [51,53,55,61,63,65,80,81,82].includes(code);
  // A chance/nearby description must not animate precipitation at this location.
  const precipitation = code !== null && code >= 51;
  if (ordinaryRain && rate === 0 || qualified && precipitation && (rate === null || rate === 0 || wx.coverage === 'VC')) code = cloud(p);
  const current: CurrentWeather = { time: p.timestamp as number, temperature: number(p.tempC), feelsLike: number(p.feelslikeC),
    humidity: percent(p.humidity), wind: positive(p.windSpeedKPH), code, isDay: p.isDay, uv: positive(p.uvi),
    precipitationRate: rate, precipitationProbability: percent(p.pop), cloudCover: percent(p.sky) };
  current.conditionLabel = currentWeatherInfo(current).label;
  return current;
}
function forecastLabel(p: Obj): string {
  const wx = codedWeather(p.weatherPrimaryCoded ?? p.weatherCoded);
  const label = weatherInfo(wx.code,p.isDay !== false).label;
  if (wx.code === null) return label;
  const qualifiers: Record<string,string> = { C:'Chance of',S:'Slight chance of',L:'Likely',IS:'Isolated',SC:'Scattered',PA:'Patchy',AR:'Areas of',BR:'Brief',FQ:'Frequent',IN:'Intermittent',NM:'Numerous',O:'Occasional',PD:'Periods of',WD:'Widespread' };
  return wx.coverage === 'VC' ? `${label} nearby` : qualifiers[wx.coverage] ? `${qualifiers[wx.coverage]} ${label.toLowerCase()}` : label;
}
export function hoursFrom(raw: unknown): HourWeather[] {
  const rows = periods(raw);
  // The app stores POP at the END of its hour, while temperature is instantaneous.
  return rows.map((p,i) => ({ conditionLabel: forecastLabel(p), time: p.timestamp as number, temperature: number(p.tempC),
    precipitation: i ? percent(rows[i-1].pop) : null, code: codedWeather(p.weatherPrimaryCoded ?? p.weatherCoded).code,
    isDay: p.isDay === true, uv: positive(p.uvi), wind: positive(p.windSpeedKPH) }));
}
export function daysFrom(raw: unknown): DayWeather[] {
  const tz = timezone(raw);
  return periods(raw).map(p => ({ conditionLabel: forecastLabel(p), time: p.timestamp as number, date: localDate((p.timestamp as number)*1000,tz),
    high: number(p.maxTempC), low: number(p.minTempC), precipitation: percent(p.pop), code: codedWeather(p.weatherPrimaryCoded).code,
    sunrise: positive(p.sunrise), sunset: positive(p.sunset), uvMax: positive(p.uvi) }));
}
export function rainFrom(raw: unknown): RainWeather[] {
  return periods(raw).map(p => {
    const code = codedWeather(p.weatherPrimaryCoded ?? p.weatherCoded).code;
    // Never label frozen or unknown precipitation as liquid rain.
    const liquid = code !== null && ([0,1,2,3,45,48,51,53,55,61,63,65,80,81,82,95].includes(code));
    return { time: (p.timestamp as number) + 60, interval: 60, amount: liquid ? positive(p.precipMM) : null };
  });
}
