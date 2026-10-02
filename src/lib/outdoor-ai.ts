import type { WeatherSnapshot } from '../types';
import { outdoorDate, outdoorWindows, type OutdoorDay, type OutdoorForecast, type OutdoorPeriod } from './outdoor.js';

export const OUTDOOR_VERSION = '1:outdoor';
export interface OutdoorRequest { kind: 'outdoor'; day: OutdoorDay; period: OutdoorPeriod; forecast: OutdoorForecast }
export interface OutdoorRecommendation { version: typeof OUTDOOR_VERSION; start: number; text: string; generatedAt: number; expiresAt: number }

/** No location names, coordinates, custom prompts, or provider choices leave the device. */
export function outdoorRequest(snapshot: WeatherSnapshot, now: number, day: OutdoorDay, period: OutdoorPeriod): OutdoorRequest {
  const date = outdoorDate(now, snapshot.timezone, day);
  const solar = snapshot.daily.find(row => row.date === date);
  const sunrise = solar?.sunrise, sunset = solar?.sunset;
  // Keep the selected day's input stable across clock ticks. Include every
  // daylight endpoint so the following-row precipitation alignment stays intact.
  const hourly = finite(sunrise) && finite(sunset)
    ? snapshot.hourly.filter(hour => hour.time >= sunrise && hour.time <= sunset).slice(0, 49) : [];
  return { kind: 'outdoor', day, period, forecast: {
    timezone: snapshot.timezone, sectionTimes: snapshot.sectionTimes && { forecast: snapshot.sectionTimes.forecast },
    hourly: hourly.map(({ time, temperature, precipitation, wind, uv, code, isDay }) => ({ time, temperature, precipitation, wind: wind ?? null, uv: uv ?? null, code, isDay })),
    daily: solar ? [{ date: solar.date, sunrise: solar.sunrise, sunset: solar.sunset }] : [],
  } };
}

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const measurement = (value: unknown, min: number, max: number) => value === null || finite(value) && value >= min && value <= max;

/** Reconstruct a bounded forecast before applying the same eligibility checks on the server. */
export function parseOutdoorRequest(raw: unknown): OutdoorRequest | null {
  const input = object(raw), forecast = object(input?.forecast), sectionTimes = object(forecast?.sectionTimes);
  if (!input || input.kind !== 'outdoor' || typeof input.day !== 'string' || !['today', 'tomorrow'].includes(input.day)
    || typeof input.period !== 'string' || !['any', 'morning', 'afternoon', 'evening'].includes(input.period) || !forecast
    || typeof forecast.timezone !== 'string' || forecast.timezone.length > 80 || !finite(sectionTimes?.forecast)
    || !Array.isArray(forecast.hourly) || forecast.hourly.length > 49 || !Array.isArray(forecast.daily) || forecast.daily.length > 3) return null;
  let timezone: string;
  try { timezone = new Intl.DateTimeFormat('en', { timeZone: forecast.timezone }).resolvedOptions().timeZone; } catch { return null; }
  const hourly: OutdoorForecast['hourly'] = [], daily: OutdoorForecast['daily'] = [];
  for (const value of forecast.hourly) {
    const hour = object(value);
    if (!hour || !finite(hour.time) || !Number.isSafeInteger(hour.time) || Math.abs(hour.time) > 1e11
      || (hourly.length > 0 && hour.time <= hourly.at(-1)!.time)
      || !measurement(hour.temperature, -100, 70) || !measurement(hour.precipitation, 0, 100)
      || !measurement(hour.wind, 0, 500) || !measurement(hour.uv, 0, 100)
      || !(hour.code === null || finite(hour.code) && Number.isInteger(hour.code) && hour.code >= 0 && hour.code <= 102)
      || typeof hour.isDay !== 'boolean') return null;
    hourly.push({ time: hour.time, temperature: hour.temperature as number | null, precipitation: hour.precipitation as number | null,
      wind: hour.wind as number | null, uv: hour.uv as number | null, code: hour.code as number | null, isDay: hour.isDay });
  }
  for (const value of forecast.daily) {
    const day = object(value);
    if (!day || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || daily.some(row => row.date === day.date)
      || !measurement(day.sunrise, 0, 1e11) || !measurement(day.sunset, 0, 1e11)) return null;
    daily.push({ date: day.date, sunrise: day.sunrise as number | null, sunset: day.sunset as number | null });
  }
  return { kind: 'outdoor', day: input.day as OutdoorDay, period: input.period as OutdoorPeriod,
    forecast: { timezone, sectionTimes: { forecast: sectionTimes.forecast }, hourly, daily } };
}

/** Numeric facts are rendered from the forecast separately. These bounded prose checks
 * reject unsupported explicit claims; they cannot prove every qualitative statement. */
export function validOutdoorChoice(value: unknown, request: OutdoorRequest, now: number): value is Pick<OutdoorRecommendation, 'start' | 'text'> {
  const choice = object(value);
  if (!choice || !finite(choice.start) || typeof choice.text !== 'string' || !choice.text.trim() || choice.text.length > 320
    || /[\d<>]|https?:|\b(?:safe|safest|guaranteed|guarantee|risk.free|no rain|rain.free|dry weather)\b/i.test(choice.text)) return false;
  const eligible = outdoorWindows(request.forecast, now, request.day, request.period);
  return eligible.status === 'recommended' && eligible.windows.some(hour => hour.start === choice.start);
}

export function validOutdoorRecommendation(value: unknown, request: OutdoorRequest, now: number): value is OutdoorRecommendation {
  const result = object(value);
  const forecastAt = request.forecast.sectionTimes?.forecast;
  return finite(forecastAt) && !!result && finite(result.start) && result.version === OUTDOOR_VERSION && finite(result.generatedAt) && finite(result.expiresAt)
    && result.generatedAt <= now && result.generatedAt >= forecastAt && result.expiresAt > now
    && result.expiresAt <= forecastAt + 3600000
    && result.expiresAt <= result.generatedAt + 900000 && result.expiresAt <= result.start * 1000
    && validOutdoorChoice(result, request, now);
}

export const outdoorInstructions = `Choose the best available hour for general time outside from the supplied forecast windows.
All windows meet the app's daylight, availability, completeness, and clear-or-cloudy condition checks.
When meetsPreferences is true, the window also meets all comfort preferences: temperature from ten to thirty Celsius, precipitation chance at most thirty percent, wind at most twenty kilometers per hour, and UV below six.
When meetsPreferences is false, no available hour meets every comfort preference. Explain the selected hour's relevant tradeoffs, such as heat, cold, higher precipitation chance, stronger wind, or higher UV. Do not describe it as ideal or comfortable, or imply that being the best available hour makes it advisable to go outside.
Favor lower precipitation chance in ten-percentage-point bands, temperatures near eighteen to twenty-four Celsius, then lower wind and UV; prefer earlier hours when otherwise similar.
Return only JSON with start (the exact Unix start of your chosen window) and text (one warm, practical sentence, at most 320 characters).
Explain your choice using only that window's supplied weather facts. Do not invent trends, comparisons, sky conditions, activities, or personal preferences.
Measurements and time appear separately in the card: do not repeat any numbers, dates, times, units, or percentages in text.
Do not promise dry weather or safety. A low precipitation chance is not zero. UV below six is a comfort preference, not a safety threshold.
No markdown, links, or extra fields.`;
