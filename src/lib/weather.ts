import type { DayWeather, Place, Units, WeatherKind, WeatherSnapshot } from '../types';

export const FRESH_FOR = 15 * 60 * 1000;
export const STALE_AFTER = 45 * 60 * 1000;
const names: Record<number, [WeatherKind, string]> = {
  0: ['clear', 'Clear skies'], 1: ['clear', 'Mostly sunny'], 2: ['partly-cloudy', 'Partly cloudy'],
  3: ['cloudy', 'Overcast'], 45: ['fog', 'Foggy'], 48: ['fog', 'Freezing fog'],
  51: ['rain', 'Light drizzle'], 53: ['rain', 'Drizzle'], 55: ['rain', 'Heavy drizzle'],
  56: ['rain', 'Freezing drizzle'], 57: ['rain', 'Freezing drizzle'],
  61: ['rain', 'Light rain'], 63: ['rain', 'Rainy'], 65: ['rain', 'Heavy rain'],
  66: ['rain', 'Freezing rain'], 67: ['rain', 'Freezing rain'],
  71: ['snow', 'Light snow'], 73: ['snow', 'Snowy'], 75: ['snow', 'Heavy snow'], 77: ['snow', 'Snow grains'],
  80: ['rain', 'Light showers'], 81: ['rain', 'Rain showers'], 82: ['rain', 'Heavy showers'],
  85: ['snow', 'Snow showers'], 86: ['snow', 'Heavy snow showers'],
  95: ['storm', 'Thunderstorms'], 96: ['storm', 'Thunderstorms & hail'], 99: ['storm', 'Thunderstorms & hail'],
};
export function weatherInfo(code: number | null, isDay = true): { kind: WeatherKind; label: string } {
  const [kind, label] = (code === null ? undefined : names[code]) ?? ['unknown', 'Conditions unavailable'];
  return { kind, label: !isDay && code === 1 ? 'Mostly clear' : !isDay && code === 0 ? 'Clear night' : label };
}
export function temperature(value: number | null | undefined, units: Units): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const converted = units === 'imperial' ? value * 9 / 5 + 32 : value;
  return `${Math.round(converted) || 0}°`;
}
export function windSpeed(value: number | null, units: Units): string {
  return value == null ? '—' : `${Math.round(units === 'imperial' ? value / 1.609344 : value)} ${units === 'imperial' ? 'mph' : 'km/h'}`;
}
export function percent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)}%`;
}
export function localDate(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function localTime(unixSeconds: number, timezone: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...options }).format(unixSeconds * 1000);
}
export function futureDays(days: DayWeather[], timezone: string, now = Date.now()): DayWeather[] {
  const today = localDate(now, timezone);
  return days.filter(day => day.date >= today).slice(0, 7);
}
export function updatedLabel(fetchedAt: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - fetchedAt) / 60000));
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days} ${days === 1 ? 'day' : 'days'} ago`;
}
export function cacheMatches(snapshot: WeatherSnapshot, place: Place): boolean {
  return snapshot.placeId === place.id && Math.abs(snapshot.latitude - place.latitude) < 0.001 && Math.abs(snapshot.longitude - place.longitude) < 0.001;
}
export function isFresh(snapshot: WeatherSnapshot, now = Date.now()): boolean {
  return now >= snapshot.fetchedAt && now - snapshot.fetchedAt < FRESH_FOR;
}

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}
function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function nonnegative(value: unknown): number | null {
  const number = numeric(value);
  return number !== null && number >= 0 ? number : null;
}
function series(data: JsonObject, key: string, index: number): number | null {
  return Array.isArray(data[key]) ? numeric(data[key][index]) : null;
}
export function normalizeWeather(raw: unknown, place: Place, now = Date.now()): WeatherSnapshot {
  const data = object(raw), current = object(data.current), hourly = object(data.hourly), daily = object(data.daily);
  const minutely = object(data.minutely_15);
  if (typeof data.timezone !== 'string' || numeric(current.time) === null || !Array.isArray(hourly.time) || !Array.isArray(daily.time)) {
    throw new Error('The weather service sent an incomplete forecast. Please try again.');
  }
  const timezone = data.timezone;
  try { localDate(now, timezone); } catch { throw new Error('The weather service sent an invalid time zone. Please try again.'); }
  return {
    version: 1, placeId: place.id, latitude: place.latitude, longitude: place.longitude, timezone, fetchedAt: now,
    current: {
      time: current.time as number, temperature: numeric(current.temperature_2m), feelsLike: numeric(current.apparent_temperature),
      humidity: numeric(current.relative_humidity_2m), wind: numeric(current.wind_speed_10m), code: numeric(current.weather_code), isDay: current.is_day !== 0,
      uv: nonnegative(current.uv_index),
    },
    hourly: hourly.time.flatMap((time, index) => numeric(time) === null ? [] : [{
      time: time as number, temperature: series(hourly, 'temperature_2m', index), precipitation: series(hourly, 'precipitation_probability', index),
      code: series(hourly, 'weather_code', index), isDay: series(hourly, 'is_day', index) !== 0,
      uv: nonnegative(series(hourly, 'uv_index', index)),
    }]),
    daily: daily.time.flatMap((time, index) => numeric(time) === null ? [] : [{
      time: time as number, date: localDate((time as number) * 1000, timezone), high: series(daily, 'temperature_2m_max', index),
      low: series(daily, 'temperature_2m_min', index), precipitation: series(daily, 'precipitation_probability_max', index),
      code: series(daily, 'weather_code', index), sunrise: series(daily, 'sunrise', index), sunset: series(daily, 'sunset', index),
      uvMax: nonnegative(series(daily, 'uv_index_max', index)),
    }]),
    minutely: Array.isArray(minutely.time) ? minutely.time.flatMap((time, index) => {
      if (numeric(time) === null) return [];
      const rain = series(minutely, 'rain', index), showers = series(minutely, 'showers', index);
      return [{ time: time as number, amount: rain !== null && rain >= 0 && showers !== null && showers >= 0 ? rain + showers : null }];
    }) : [],
  };
}
