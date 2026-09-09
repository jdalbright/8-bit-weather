import type { Units, WeatherSnapshot } from '../types';
import { STALE_AFTER } from './weather';

export const RAIN_INTERVAL = 15 * 60;
export const RAIN_WINDOW = 2 * 60 * 60;
// Suppress trace model amounts that would otherwise surface a card on dry days.
export const RAIN_THRESHOLD = 0.1;
export interface RainPeriod { time: number; amount: number }
export interface RainOutlookData { periods: RainPeriod[]; firstRainIndex: number }

export function upcomingRain(snapshot: WeatherSnapshot, now: number, online: boolean): RainOutlookData | null {
  if (!online || now < snapshot.fetchedAt || now - snapshot.fetchedAt >= STALE_AFTER || now / 1000 - snapshot.current.time > 3600) return null;
  const start = now / 1000, end = start + RAIN_WINDOW;
  const samples = new Map(snapshot.minutely?.map(period => [period.time, period.amount]));
  const periods: RainPeriod[] = [];
  // Open-Meteo labels accumulated rain at the END of each interval. Include only
  // intervals overlapping the next two hours, including partial edge intervals.
  for (let time = Math.floor(start / RAIN_INTERVAL) * RAIN_INTERVAL + RAIN_INTERVAL; time - RAIN_INTERVAL < end; time += RAIN_INTERVAL) {
    const amount = samples.get(time);
    // Missing coverage must never be presented as a dry interval.
    if (amount == null || !Number.isFinite(amount) || amount < 0) return null;
    periods.push({ time, amount });
  }
  const firstRainIndex = periods.findIndex(period => period.amount >= RAIN_THRESHOLD);
  return firstRainIndex < 0 ? null : { periods, firstRainIndex };
}

export function rainAmount(mm: number, units: Units): string {
  if (mm === 0) return units === 'imperial' ? '0 in' : '0 mm';
  if (units === 'imperial') return mm / 25.4 < 0.01 ? '<0.01 in' : `${(mm / 25.4).toFixed(2)} in`;
  return mm < 0.1 ? '<0.1 mm' : `${mm.toFixed(1)} mm`;
}
