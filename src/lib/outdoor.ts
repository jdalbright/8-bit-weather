import type { DayWeather, HourWeather } from '../types';
import { localDate, precipitationForHour, weatherInfo } from './weather.js';

export type OutdoorDay = 'today' | 'tomorrow';
export type OutdoorPeriod = 'any' | 'morning' | 'afternoon' | 'evening';
export interface OutdoorWindow {
  start: number; end: number; temperature: number; precipitation: number; wind: number; uv: number;
  meetsPreferences: boolean;
}
export interface OutdoorForecast { timezone: string; sectionTimes?: { forecast: number }; hourly: HourWeather[]; daily: Pick<DayWeather, 'date' | 'sunrise' | 'sunset'>[] }
export type OutdoorResult =
  | { status: 'recommended'; window: OutdoorWindow; forecastAt: number }
  | { status: 'no-comfortable-window' | 'no-daylight' | 'unavailable' };

const HOUR = 3600;
const periodHours = { any: [0, 24], morning: [0, 12], afternoon: [12, 17], evening: [17, 24] } as const;
const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
const comfortDistance = (temperature: number) => Math.max(18 - temperature, 0, temperature - 24);
const rank = (hour: OutdoorWindow) => [Math.floor(hour.precipitation / 10), comfortDistance(hour.temperature), hour.wind, hour.uv, hour.start];

/** Calendar arithmetic keeps tomorrow correct across DST and year boundaries. */
export function outdoorDate(now: number, timezone: string, day: OutdoorDay): string {
  const calendar = new Date(`${localDate(now, timezone)}T12:00:00Z`);
  if (day === 'tomorrow') calendar.setUTCDate(calendar.getUTCDate() + 1);
  return calendar.toISOString().slice(0, 10);
}

/** A comfort preference using forecast hours, not a weather warning or a safety assessment. */
export function outdoorWindows(snapshot: OutdoorForecast, now: number, day: OutdoorDay, period: OutdoorPeriod):
  { status: 'recommended'; windows: OutdoorWindow[]; forecastAt: number } | Exclude<OutdoorResult, { status: 'recommended' }> {
  const forecastAt = snapshot.sectionTimes?.forecast;
  // A current/history refresh must never renew the age of the forecast section.
  if (!finite(forecastAt) || !finite(now) || now < forecastAt || now - forecastAt > HOUR * 1000) return { status: 'unavailable' };
  const date = outdoorDate(now, snapshot.timezone, day);
  const solar = snapshot.daily.find(row => row.date === date);
  const sunrise = solar?.sunrise, sunset = solar?.sunset;
  if (!finite(sunrise) || !finite(sunset) || sunrise >= sunset
    || !Number.isFinite(new Date(sunrise * 1000).getTime()) || !Number.isFinite(new Date(sunset * 1000).getTime())
    || localDate(sunrise * 1000, snapshot.timezone) !== date || localDate(sunset * 1000, snapshot.timezone) !== date) return { status: 'unavailable' };

  const clock = new Intl.DateTimeFormat('en-US', { timeZone: snapshot.timezone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  const minuteOfDay = (time: number) => {
    const parts = clock.formatToParts(time * 1000);
    return Number(parts.find(part => part.type === 'hour')?.value) * 60 + Number(parts.find(part => part.type === 'minute')?.value);
  };
  const [from, to] = periodHours[period];
  const candidates: OutdoorWindow[] = [];
  let daylightHours = 0, missing = false;
  const hours = new Map(snapshot.hourly.map(hour => [hour.time, hour]));
  // Use the provider's hourly grid, which can begin on a fractional UTC hour.
  // Prefer this daylight period's grid in case a location's offset has changed.
  const anchor = snapshot.hourly.find(hour => hour.time >= sunrise && hour.time < sunset) ?? snapshot.hourly[0];
  const offset = anchor && finite(anchor.time) ? anchor.time % HOUR : 0;
  const first = Math.max(Math.floor((now / 1000 - offset) / HOUR) * HOUR + HOUR + offset, Math.ceil((sunrise - offset) / HOUR) * HOUR + offset);
  for (let start = first; start + HOUR <= sunset; start += HOUR) {
    const end = start + HOUR;
    if (minuteOfDay(start) < from * 60 || minuteOfDay(end - 1) >= to * 60) continue;
    daylightHours++;
    const hour = hours.get(start);
    const precipitation = precipitationForHour(snapshot.hourly, start);
    if (!hour || start >= now / 1000 + 48 * HOUR || !finite(hour.temperature) || !finite(hour.wind) || hour.wind < 0
      || !finite(hour.uv) || hour.uv < 0 || !finite(precipitation) || precipitation < 0 || precipitation > 100
      || weatherInfo(hour.code).kind === 'unknown') { missing = true; continue; }
    if (![0, 1, 2, 3].includes(hour.code!)) continue;
    const meetsPreferences = hour.temperature >= 10 && hour.temperature <= 30
      && precipitation <= 30 && hour.wind <= 20 && hour.uv < 6;
    candidates.push({ start, end, temperature: hour.temperature, precipitation, wind: hour.wind, uv: hour.uv, meetsPreferences });
  }
  candidates.sort((a, b) => {
    const left = rank(a), right = rank(b);
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] - right[i];
    return 0;
  });
  // Comfort preferences should rank the available hours, not erase the action
  // on a warm day. Only offer a compromise when no hour meets all preferences.
  const preferred = candidates.filter(hour => hour.meetsPreferences);
  if (candidates[0]) return { status: 'recommended', windows: preferred.length ? preferred : candidates, forecastAt };
  if (!daylightHours) return { status: 'no-daylight' };
  return { status: missing ? 'unavailable' : 'no-comfortable-window' };
}

export function bestTimeOutside(snapshot: OutdoorForecast, now: number, day: OutdoorDay, period: OutdoorPeriod): OutdoorResult {
  const result = outdoorWindows(snapshot, now, day, period);
  return result.status === 'recommended' ? { status: 'recommended', window: result.windows[0], forecastAt: result.forecastAt } : result;
}
