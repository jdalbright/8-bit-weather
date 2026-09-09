import type { HourWeather, Units, WeatherSnapshot } from '../types';
import { localTime, STALE_AFTER, temperature, weatherInfo } from './weather.js';

export const BRIEFING_VERSION = '1:warm-practical';
export const BRIEFING_PATH = '/api/weather-briefing';
export const BRIEFING_TTL = 15 * 60 * 1000;
export const BRIEFING_STORAGE = '8bit-weather:v1:briefings';
export const HOUR = 3600;
export type BriefingHour = Pick<HourWeather, 'time' | 'temperature' | 'precipitation' | 'code' | 'isDay'>;
export interface BriefingForecast {
  timezone: string;
  fetchedAt: number;
  observationTime: number;
  units: Units;
  hourly: BriefingHour[];
}
export interface WeatherBriefing {
  text: string;
  generatedAt: number;
  windowStart: number;
  windowEnd: number;
  expiresAt: number;
  version: typeof BRIEFING_VERSION;
}

function supportedCode(code: number | null): number | null {
  return weatherInfo(code).kind === 'unknown' ? null : code;
}

export function briefingForecast(snapshot: WeatherSnapshot, units: Units, now: number): BriefingForecast {
  return {
    timezone: snapshot.timezone, fetchedAt: snapshot.fetchedAt, observationTime: snapshot.current.time, units,
    // Include the trailing interval endpoint so precipitation can be aligned correctly.
    hourly: snapshot.hourly.filter(h => h.time + HOUR > now / 1000).slice(0, 26)
      .map(({ time, temperature, precipitation, code, isDay }) => ({ time, temperature, precipitation, code: supportedCode(code), isDay })),
  };
}

export function forecastUsable(forecast: BriefingForecast, now: number): boolean {
  if (forecast.fetchedAt > now + 60000 || now - forecast.fetchedAt >= STALE_AFTER
    || forecast.observationTime * 1000 > now + 60000 || now - forecast.observationTime * 1000 > 3600000) return false;
  const start = now / 1000, end = start + 24 * HOUR;
  const hours = forecast.hourly.filter(h => h.time < end && h.time + HOUR > start);
  if (!hours.length || hours[0].time > start || hours.at(-1)!.time + HOUR < end) return false;
  return hours.every((h, i) => (i === 0 || h.time === hours[i - 1].time + HOUR)
    && (h.temperature !== null || supportedCode(h.code) !== null || forecast.hourly.find(next => next.time === h.time + HOUR)?.precipitation != null));
}

/** Reconstruct only supported fields; never forward arbitrary client strings to the model. */
export function parseBriefingForecast(value: unknown): BriefingForecast | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const measurement = (n: unknown, min: number, max: number) => n === null || finite(n) && n >= min && n <= max;
  if (typeof v.timezone !== 'string' || v.timezone.length > 80 || !finite(v.fetchedAt) || !finite(v.observationTime)
    || (v.units !== 'imperial' && v.units !== 'metric') || !Array.isArray(v.hourly) || v.hourly.length < 24 || v.hourly.length > 26) return null;
  let timezone: string;
  try { timezone = new Intl.DateTimeFormat('en', { timeZone: v.timezone }).resolvedOptions().timeZone; } catch { return null; }
  const hourly: BriefingHour[] = [];
  for (const item of v.hourly) {
    if (!item || typeof item !== 'object') return null;
    const h = item as Record<string, unknown>;
    if (!finite(h.time) || !Number.isInteger(h.time) || !measurement(h.temperature, -100, 70)
      || !measurement(h.precipitation, 0, 100) || !measurement(h.code, 0, 99)
      || (h.code !== null && !Number.isInteger(h.code)) || typeof h.isDay !== 'boolean'
      || (hourly.length > 0 && h.time !== hourly.at(-1)!.time + HOUR)) return null;
    hourly.push({ time: h.time, temperature: h.temperature as number | null, precipitation: h.precipitation as number | null, code: supportedCode(h.code as number | null), isDay: h.isDay });
  }
  return { timezone, fetchedAt: v.fetchedAt, observationTime: v.observationTime, units: v.units, hourly };
}

export function briefingFacts(forecast: BriefingForecast, now: number) {
  const start = now / 1000, end = start + 24 * HOUR;
  const time = (seconds: number) => localTime(seconds, forecast.timezone,
    { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return {
    from: time(start), until: time(end), temperatureUnit: forecast.units === 'imperial' ? 'Fahrenheit' : 'Celsius',
    hours: forecast.hourly.filter(h => h.time < end && h.time + HOUR > start).map(h => ({
      from: time(Math.max(start, h.time)), until: time(Math.min(end, h.time + HOUR)),
      temperature: h.temperature === null ? null : temperature(h.temperature, forecast.units),
      conditions: supportedCode(h.code) === null ? null : weatherInfo(h.code, h.isDay).label,
      precipitationChancePercent: forecast.hourly.find(next => next.time === h.time + HOUR)?.precipitation ?? null,
    })),
  };
}

export function isWeatherBriefing(value: unknown): value is WeatherBriefing {
  if (!value || typeof value !== 'object') return false;
  const b = value as WeatherBriefing;
  return b.version === BRIEFING_VERSION && typeof b.text === 'string' && b.text.trim().length > 0 && b.text.length <= 1600
    && [b.generatedAt, b.windowStart, b.windowEnd, b.expiresAt].every(n => typeof n === 'number' && Number.isFinite(n))
    && b.windowEnd - b.windowStart === 24 * HOUR * 1000 && b.generatedAt >= b.windowStart
    && b.expiresAt > b.generatedAt && b.expiresAt <= b.generatedAt + BRIEFING_TTL;
}
