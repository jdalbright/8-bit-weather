import type { Units, WeatherSnapshot } from '../types';
import { STALE_AFTER } from './weather';

export const RAIN_INTERVAL = 15 * 60;
export const RAIN_WINDOW = 60 * 60;
// Suppress trace model amounts that would otherwise surface a card on dry days.
export const RAIN_THRESHOLD = 0.1;
export interface RainPeriod { time: number; amount: number }
export interface RainOutlookData { periods: RainPeriod[]; firstRainIndex: number; interval: number }

export function upcomingRain(snapshot: WeatherSnapshot, now: number, online: boolean): RainOutlookData | null {
  if (!online || now < snapshot.fetchedAt || now - snapshot.fetchedAt >= STALE_AFTER || now / 1000 - snapshot.current.time > 3600) return null;
  const minute = snapshot.provider === 'xweather';
  const interval = minute ? 60 : RAIN_INTERVAL;
  if (minute && (!snapshot.sectionTimes?.rain || now - snapshot.sectionTimes.rain >= 600000)) return null;
  const start = Math.floor(now / (interval * 1000)) * interval;
  const end = minute ? Math.floor(snapshot.sectionTimes!.rain! / 60000) * 60 + RAIN_WINDOW : now / 1000 + RAIN_WINDOW;
  if (end <= start) return null;
  const samples = new Map(snapshot.minutely?.map(period => [period.time, period.amount]));
  const periods: RainPeriod[] = [];
  for (let time = start + interval; minute ? time <= end : time - interval < end; time += interval) {
    const amount = samples.get(time);
    if (amount == null || !Number.isFinite(amount) || amount < 0) return null;
    periods.push({ time, amount });
  }
  const firstRainIndex = periods.findIndex(period => period.amount * 3600 / interval >= RAIN_THRESHOLD * 4);
  return firstRainIndex < 0 ? null : { periods, firstRainIndex, interval };

}

export function rainAmount(mm: number, units: Units): string {
  if (mm === 0) return units === 'imperial' ? '0 in' : '0 mm';
  if (units === 'imperial') return mm / 25.4 < 0.01 ? '<0.01 in' : `${(mm / 25.4).toFixed(2)} in`;
  return mm < 0.1 ? '<0.1 mm' : `${mm.toFixed(1)} mm`;
}
