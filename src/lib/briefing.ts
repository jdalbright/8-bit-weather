import { MAX_BRIEFING_TEXT_LENGTH } from './briefing-prompt.js';
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
  provider?: 'apple' | 'openai';
  /** OS model generation, not an Apple model identifier. Absent in older caches. */
  appleModelOSMajor?: number;
  /** Revision of the Apple facts, instructions and validation contract. */
  applePromptRevision?: number;
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
    // Unknown legacy WMO codes become missing data; provider extensions must
    // belong to the shared supported-code mapping.
    const validCode = h.code === null || finite(h.code) && Number.isInteger(h.code)
      && ((h.code >= 0 && h.code <= 99) || supportedCode(h.code) !== null);
    if (!finite(h.time) || !Number.isInteger(h.time) || !measurement(h.temperature, -100, 70)
      || !measurement(h.precipitation, 0, 100) || !validCode || typeof h.isDay !== 'boolean'
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
  return (b.provider === undefined || b.provider === 'apple' || b.provider === 'openai') && b.version === BRIEFING_VERSION && typeof b.text === 'string' && b.text.trim().length > 0 && b.text.length <= MAX_BRIEFING_TEXT_LENGTH
    && (b.applePromptRevision === undefined || Number.isInteger(b.applePromptRevision) && b.applePromptRevision >= 1)
    && (b.appleModelOSMajor === undefined || Number.isInteger(b.appleModelOSMajor) && b.appleModelOSMajor >= 1)
    && [b.generatedAt, b.windowStart, b.windowEnd, b.expiresAt].every(n => typeof n === 'number' && Number.isFinite(n))
    && b.windowEnd - b.windowStart === 24 * HOUR * 1000 && b.generatedAt >= b.windowStart
    && b.expiresAt > b.generatedAt && b.expiresAt <= b.generatedAt + BRIEFING_TTL;
}

/** Shared bounded measurement, coverage and steady-temperature checks.
 * These do not prove arbitrary prose or timing claims are correct. */
export function validBriefingClaims(text: string, forecast: BriefingForecast, now: number): boolean {
  const facts = briefingFacts(forecast, now);
  const normalized = text.replaceAll('−', '-');
  const probabilities = new Set(facts.hours.flatMap(hour => hour.precipitationChancePercent === null ? [] : [hour.precipitationChancePercent]));
  const temperatures = new Set(facts.hours.flatMap(hour => hour.temperature === null ? [] : [Number.parseFloat(hour.temperature)]));
  // A range's two endpoints share its trailing unit ("58–76°F", "10 to 20%").
  const numbers = /(-?\d+(?:\.\d+)?)(?:\s*(?:–|—|-|to|and)\s*(-?\d+(?:\.\d+)?))?\s*(%|percent\b|degrees?(?:\s*(?:Fahrenheit|Celsius|[FC]\b))?|°\s*[FC]?)/gi;
  for (const match of normalized.matchAll(numbers)) {
    const probability = /%|percent/i.test(match[3]);
    const allowed = probability ? probabilities : temperatures;
    if (!allowed.has(Number(match[1])) || (match[2] !== undefined && !allowed.has(Number(match[2])))) return false;
    if (!probability && (forecast.units === 'imperial' ? /C|Celsius/i : /F|Fahrenheit/i).test(match[3])) return false;
  }
  const missingTemperature = facts.hours.some(hour => hour.temperature === null);
  const missingPrecipitation = facts.hours.some(hour => hour.precipitationChancePercent === null);
  // Match each measurement separately: "available temperatures" cannot excuse
  // an unsupported claim about rain, or vice versa.
  const missingClaim = (topic: string, otherTopic: string) => {
    const missing = '(?:missing|unknown|incomplete|unavailable|limited|partial)';
    // A comma can connect "precipitation data ..., though the data is incomplete".
    // Another measurement or sentence boundary still ends that topic's scope.
    const sameTopic = `(?:(?!\\b(?:${otherTopic})\\b)[^.!?;]){0,45}`;
    return new RegExp(`(?:${topic})${sameTopic}\\b${missing}\\b|\\b${missing}(?:\\s+(?:data|readings|information|coverage|for|on|about|the)){0,4}\\s+(?:${topic})|\\bno (?:available )?(?:${topic})(?: data| readings?| information| coverage)\\b|\\bno (?:${topic}) (?:is |are )?available\\b`, 'i');
  };
  const temperatureMissingClaim = missingClaim('temperatures?', 'rain|precipitation');
  const rainMissingClaim = missingClaim('rain|precipitation', 'temperatures?');
  if (!missingTemperature && temperatureMissingClaim.test(text)) return false;
  if (!missingPrecipitation && rainMissingClaim.test(text)) return false;
  const availableTemperatures = /\b(?:available|known) (?:temperature|readings)|\b(?:temperature|readings)[^.!?;,]{0,40}\b(?:available|known)\b/i.test(text);
  if (temperatures.size === 0 && availableTemperatures) return false;
  if (missingTemperature && !availableTemperatures && !temperatureMissingClaim.test(text)) return false;
  if (missingPrecipitation && !rainMissingClaim.test(text)) return false;
  if (missingPrecipitation && /\b(?:no|zero) (?:chance|rain|snow|precipitation)|\b(?:stay|stays|remain|remains|expect|be|is|looks?) (?:\w+ ){0,2}dry\b|\bdry (?:weather|throughout|conditions|day|night)|\b(?:won't|will not) (?:rain|snow)\b/i.test(text)) return false;
  if (missingTemperature && temperatures.size > 0 && /\bno (?:available )?temperature (?:data|readings)|\ball temperature (?:data|readings)[^.!?;]{0,20}(?:missing|unavailable)/i.test(text)) return false;
  if (missingPrecipitation && probabilities.size > 0 && /\bno (?:available )?(?:rain|precipitation) (?:data|readings)|\ball (?:rain|precipitation) (?:data|readings)[^.!?;]{0,20}(?:missing|unavailable)/i.test(text)) return false;
  // Unqualified "unavailable" overstates partial coverage. A nearby explicit
  // qualifier such as "for part of the forecast" remains valid.
  for (const clause of text.split(/[.!?;,]/)) {
    if (!/\bunavailable\b/i.test(clause) || /\b(?:some|part|partly|partial|partially|incomplete|limited)\b/i.test(clause)) continue;
    if (missingTemperature && temperatures.size > 0 && /\btemperature/i.test(clause)) return false;
    if (missingPrecipitation && probabilities.size > 0 && /\b(?:rain|precipitation)\b/i.test(clause)) return false;
  }
  const known = forecast.hourly.filter(hour => hour.time < now / 1000 + 24 * HOUR && hour.time + HOUR > now / 1000)
    .flatMap(hour => hour.temperature === null ? [] : [hour.temperature]);
  if (known.length && Math.max(...known) - Math.min(...known) < 2 && /\b(?:cooling|warming|warm up|cool down|warms up|cools down)\b/i.test(text)) return false;
  return true;
}
