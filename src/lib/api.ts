import type { Place, WeatherSnapshot } from '../types';
import { isNativeApp, locateNative } from './native';
import { validSnapshot } from './storage';
import type { WeatherPart, WeatherSection } from './xweather';

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
    if (response.status === 503) {
      const body = await response.json().catch(() => ({}));
      const retry = Number(response.headers.get('Retry-After'));
      throw new WeatherRequestError(body.code === 'weather_unconfigured' ? 'The weather service is not configured yet. Please try again later.' : 'Weather is temporarily unavailable. Please try again shortly.', Number.isFinite(retry) && retry > 0 ? retry * 1000 : 0);
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
export function weatherEndpoint(): string {
  if (!isNativeApp()) return '/api/weather';
  try {
    const url = new URL(import.meta.env.VITE_NATIVE_WEATHER_URL);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/api/weather') return url.href;
  } catch { /* Recoverable configuration error. */ }
  throw new WeatherRequestError('Weather is not configured for this app yet.');
}
const parts = new Map<string, WeatherPart>();
export function clearWeatherParts() { parts.clear(); }
export async function fetchWeather(place: Place, signal: AbortSignal): Promise<WeatherSnapshot> {
  const endpoint = weatherEndpoint();
  const section = async (name: WeatherSection, timezone?: string): Promise<WeatherPart> => {
    const params = new URLSearchParams({ latitude: place.latitude.toFixed(4), longitude: place.longitude.toFixed(4), section: name });
    if (timezone) params.set('timezone', timezone);
    const url = `${endpoint}?${params}`, cached = parts.get(url);
    if (cached && cached.updatedAt <= Date.now() && cached.expiresAt > Date.now()) return cached;
    const data = await requestJson(url, signal) as WeatherPart;
    if (!data || data.provider !== 'xweather' || !Number.isFinite(data.updatedAt) || !Number.isFinite(data.expiresAt)
      || data.updatedAt > Date.now() + 60000 || data.expiresAt <= data.updatedAt
      || Math.abs(data.latitude-place.latitude)>0.001 || Math.abs(data.longitude-place.longitude)>0.001
      || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) throw new WeatherRequestError('The weather service sent an incomplete forecast.');
    const emptyCurrent = {time:0,temperature:null,feelsLike:null,humidity:null,wind:null,code:null,isDay:true};
    if ((name === 'current' && !data.current) || (name === 'forecast' && (!data.hourly?.length || !data.daily?.length))
      || (name === 'rain' && !Array.isArray(data.minutely)) || (name === 'history' && !Array.isArray(data.hourly))
      || !validSnapshot({version:1,provider:'xweather',placeId:place.id,latitude:data.latitude,longitude:data.longitude,timezone:data.timezone,
        fetchedAt:data.updatedAt,refreshAfter:data.expiresAt,sectionTimes:{current:data.updatedAt,forecast:data.updatedAt},
        current:data.current ?? emptyCurrent,hourly:data.hourly ?? [],daily:data.daily ?? [],minutely:data.minutely})) {
      throw new WeatherRequestError('The weather service sent an incomplete forecast.');
    }
    if (parts.size >= 64) parts.delete(parts.keys().next().value!);
    parts.set(url,data); return data;
  };
  const [current, forecast, rain] = await Promise.all([section('current'),section('forecast'),section('rain').catch(() => null)]);
  const history = await section('history',current.timezone).catch(() => null);
  const hours = new Map([...(history?.hourly ?? []),...(forecast.hourly ?? [])].map(h=>[h.time,h]));
  const snapshot: WeatherSnapshot = { version:1, provider:'xweather', placeId:place.id, latitude:place.latitude,longitude:place.longitude,
    timezone:current.timezone, fetchedAt:current.updatedAt, refreshAfter:Math.min(current.expiresAt,forecast.expiresAt,rain?.expiresAt ?? Infinity),
    sectionTimes:{current:current.updatedAt,forecast:forecast.updatedAt,rain:rain?.updatedAt,history:history?.updatedAt},
    current:current.current!, hourly:[...hours.values()].sort((a,b)=>a.time-b.time),daily:forecast.daily!,minutely:rain?.minutely ?? [] };
  if (signal.aborted) throw new DOMException('Request superseded', 'AbortError');
  if (!validSnapshot(snapshot) || !snapshot.hourly.length || !snapshot.daily.length) throw new WeatherRequestError('The weather service sent an incomplete forecast.');
  return snapshot;
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
  if (isNativeApp()) return locateNative();
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
