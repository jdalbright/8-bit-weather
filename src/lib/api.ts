import type { Place, WeatherSnapshot } from '../types';
import { normalizeWeather } from './weather';

export class WeatherRequestError extends Error {
  constructor(message: string, public retryAfterMs = 0) { super(message); this.name = 'WeatherRequestError'; }
}
async function requestJson(url: string, signal: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429) {
      const header = response.headers.get('Retry-After');
      const seconds = header ? Number(header) : NaN;
      const delay = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : 60000;
      throw new WeatherRequestError('The weather service is busy. Please wait a moment before refreshing.', Math.max(60000, Number.isFinite(delay) ? delay : 60000));
    }
    if (!response.ok) throw new WeatherRequestError('The weather service is taking a break. Please try again shortly.');
    return await response.json();
  } catch (error) {
    if (signal.aborted) throw new DOMException('Request superseded', 'AbortError');
    if (error instanceof WeatherRequestError) throw error;
    if (controller.signal.aborted) throw new WeatherRequestError('The forecast took too long to arrive. Please try again.');
    throw new WeatherRequestError('Couldn’t reach the weather service. Check your connection and try again.');
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  }
}
export async function fetchWeather(place: Place, signal: AbortSignal): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(place.latitude), longitude: String(place.longitude), timezone: 'auto', timeformat: 'unixtime',
    forecast_days: '7', forecast_hours: '48',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
  });
  return normalizeWeather(await requestJson(`https://api.open-meteo.com/v1/forecast?${params}`, signal), place);
}
export async function searchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  if (query.trim().length < 3) return [];
  const params = new URLSearchParams({ name: query.trim(), count: '8', language: 'en', format: 'json' });
  const data = await requestJson(`https://geocoding-api.open-meteo.com/v1/search?${params}`, signal);
  if (!data || typeof data !== 'object' || !('results' in data) || !Array.isArray(data.results)) return [];
  return data.results.flatMap((item: Record<string, unknown>) => {
    if (typeof item.name !== 'string' || typeof item.latitude !== 'number' || typeof item.longitude !== 'number' || !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return [];
    return [{ id: String(item.id ?? `${item.latitude},${item.longitude}`), name: item.name,
      latitude: item.latitude, longitude: item.longitude, region: typeof item.admin1 === 'string' ? item.admin1 : undefined,
      country: typeof item.country === 'string' ? item.country : undefined, source: 'search' as const }];
  });
}
export function locate(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) { reject(new Error('Location needs a secure connection. You can search for a city instead.')); return; }
    if (!navigator.geolocation) { reject(new Error('This browser doesn’t support location. Search for a city instead.')); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ id: 'current-location', name: 'Current location', latitude: Number(coords.latitude.toFixed(3)), longitude: Number(coords.longitude.toFixed(3)), source: 'gps' }),
      error => reject(new Error(error.code === 1 ? 'Location permission is off. Allow it in your browser settings, or search for a city.' : error.code === 3 ? 'Finding your location took too long. Try again, or search for a city.' : 'Couldn’t find your location. Try again, or search for a city.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}
