import type { Place, WeatherSnapshot } from '../types';
import { cacheMatches, localTime } from './weather';

export interface ForecastSelection { placeId: string; latitude: number; longitude: number; time: number }

export function forecastHours(snapshot: WeatherSnapshot | null, now: number) {
  return snapshot?.hourly.filter(hour => hour.time + 3600 > now / 1000 && hour.time < now / 1000 + 86400).slice(0, 24) ?? [];
}

export function resolveForecastSelection(selection: ForecastSelection | null, place: Place | null, snapshot: WeatherSnapshot | null, now: number) {
  if (!selection || !place || !snapshot || !cacheMatches(snapshot, place)
    || selection.placeId !== place.id || selection.latitude !== place.latitude || selection.longitude !== place.longitude) return null;
  // Once this becomes the current hour, return to real current conditions.
  return forecastHours(snapshot, now).find(hour => hour.time === selection.time && hour.time > now / 1000) ?? null;
}

export function forecastTimeLabel(time: number, timezone: string) {
  return localTime(time, timezone, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}
