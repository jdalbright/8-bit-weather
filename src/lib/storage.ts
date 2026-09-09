import type { Place, Preferences, WeatherSnapshot } from '../types';
import { cacheMatches } from './weather';

export const STORAGE_KEY = '8bit-weather:v1';
type StoredState = { preferences: Preferences; places: Place[]; selected: Place | null };
export function defaultPreferences(locale = navigator.language): Preferences {
  return { units: /(?:^|-)US\b/i.test(locale) ? 'imperial' : 'metric', music: true, ambience: true, effects: true,
    musicVolume: 0.35, ambienceVolume: 0.25, effectsVolume: 0.4, reducedMotion: false };
}
function read(key: string): unknown { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } }
function write(key: string, value: unknown): boolean { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== 'object') return false;
  const p = value as Place;
  return typeof p.id === 'string' && typeof p.name === 'string' && typeof p.latitude === 'number' && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90
    && typeof p.longitude === 'number' && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 && (p.source === 'gps' || p.source === 'search');
}
export function loadState(): StoredState {
  const fallback: StoredState = { preferences: defaultPreferences(), places: [], selected: null };
  const value = read(STORAGE_KEY);
  if (!value || typeof value !== 'object') return fallback;
  const state = value as Partial<StoredState>;
  const raw = state.preferences && typeof state.preferences === 'object' ? state.preferences : {} as Partial<Preferences>;
  const prefs = { ...fallback.preferences };
  if (raw.units === 'metric' || raw.units === 'imperial') prefs.units = raw.units;
  for (const key of ['music', 'ambience', 'effects', 'reducedMotion'] as const) if (typeof raw[key] === 'boolean') prefs[key] = raw[key];
  for (const key of ['musicVolume', 'ambienceVolume', 'effectsVolume'] as const) if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) prefs[key] = Math.min(1, Math.max(0, raw[key]));
  return { preferences: prefs, places: Array.isArray(state.places) ? state.places.filter(isPlace) : [], selected: isPlace(state.selected) ? state.selected : null };
}
export function saveState(state: StoredState): boolean { return write(STORAGE_KEY, state); }
function validSnapshot(value: unknown): value is WeatherSnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as WeatherSnapshot;
  if (s.version !== 1 || typeof s.placeId !== 'string' || !Number.isFinite(s.fetchedAt) || !Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)
    || typeof s.timezone !== 'string' || !s.current || !Number.isFinite(s.current.time) || !Array.isArray(s.hourly) || !Array.isArray(s.daily)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: s.timezone }); } catch { return false; }
  const measurement = (n: unknown) => n === null || typeof n === 'number' && Number.isFinite(n);
  const uv = (n: unknown) => n === undefined || n === null || typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if (!uv(s.current.uv) || !s.hourly.every(h => h && uv(h.uv)) || !s.daily.every(d => d && uv(d.uvMax))) return false;
  if (![s.current.temperature, s.current.feelsLike, s.current.humidity, s.current.wind, s.current.code].every(measurement) || typeof s.current.isDay !== 'boolean') return false;
  if (s.minutely !== undefined && (!Array.isArray(s.minutely) || !s.minutely.every(r => r && Number.isFinite(r.time) && measurement(r.amount) && (r.amount === null || r.amount >= 0)))) return false;
  return s.hourly.every(h => h && Number.isFinite(h.time) && [h.temperature, h.precipitation, h.code].every(measurement) && typeof h.isDay === 'boolean')
    && s.daily.every(d => d && Number.isFinite(d.time) && typeof d.date === 'string' && [d.high, d.low, d.precipitation, d.code, d.sunrise, d.sunset].every(measurement));
}
function readCache(): WeatherSnapshot[] { const data = read(`${STORAGE_KEY}:forecasts`); return Array.isArray(data) ? data.filter(validSnapshot) : []; }
export function cachedWeather(place: Place): WeatherSnapshot | null { return readCache().find(s => cacheMatches(s, place)) ?? null; }
export function cacheWeather(snapshot: WeatherSnapshot): void {
  write(`${STORAGE_KEY}:forecasts`, [snapshot, ...readCache().filter(s => s.placeId !== snapshot.placeId)].slice(0, 12));
}
export function clearSavedData(): void { try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(`${STORAGE_KEY}:forecasts`); } catch { /* The app remains usable without persistent storage. */ } }
