import type { WeatherSnapshot } from '../types';
import { FRESH_FOR, localDate, STALE_AFTER } from './weather';

// Standard UV categories: https://www.weather.gov/ilx/uv-index
export const UV_LEVELS = [
  { id: 'low', label: 'Low', range: '0–2', max: 2, tip: 'Wear sunglasses on bright days. If you burn easily, cover up and use SPF 30+ sunscreen.' },
  { id: 'moderate', label: 'Moderate', range: '3–5', max: 5, tip: 'Seek shade around midday. Wear a hat and sunglasses, and use SPF 30+ sunscreen.' },
  { id: 'high', label: 'High', range: '6–7', max: 7, tip: 'Reduce time in the midday sun. Choose shade, protective clothing, and SPF 30+ sunscreen.' },
  { id: 'very-high', label: 'Very high', range: '8–10', max: 10, tip: 'Minimize midday sun exposure. Use shade, protective clothing, sunglasses, and SPF 30+ sunscreen.' },
  { id: 'extreme', label: 'Extreme', range: '11+', max: Infinity, tip: 'Avoid midday sun exposure. If outside, use shade, protective clothing, sunglasses, and SPF 30+ sunscreen.' },
] as const;

export function validUv(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
export function uvInfo(value: number | null | undefined) {
  if (!validUv(value)) return null;
  const index = Math.round(value);
  return { index, level: UV_LEVELS.find(level => index <= level.max)! };
}
export function uvForecast(snapshot: WeatherSnapshot, now: number, online: boolean) {
  const today = localDate(now, snapshot.timezone);
  const day = snapshot.daily.find(day => day.date === today);
  const seconds = now / 1000;
  const stale = !online || now < snapshot.fetchedAt || now - snapshot.fetchedAt >= STALE_AFTER
    || seconds - snapshot.current.time > 3600 || seconds < snapshot.current.time;
  const hours = snapshot.hourly.filter(hour => localDate(hour.time * 1000, snapshot.timezone) === today).sort((a, b) => a.time - b.time);
  const currentHour = hours.find(hour => hour.time <= seconds && hour.time + 3600 > seconds);
  const currentValue = seconds - snapshot.current.time < FRESH_FOR / 1000 && validUv(snapshot.current.uv) ? snapshot.current.uv : currentHour?.uv;
  const current = stale ? null : uvInfo(currentValue);
  // Check actual local-day boundaries, not the provider's fixed-offset daily timestamps.
  const complete = !!day && hours.length > 0 && localDate(hours[0].time * 1000 - 1, snapshot.timezone) !== today
    && localDate((hours.at(-1)!.time + 3600) * 1000, snapshot.timezone) !== today
    && hours.every((hour, index) => validUv(hour.uv) && (index === 0 || hour.time - hours[index - 1].time === 3600));
  const peakHour = complete ? hours.reduce((peak, hour) => hour.uv! > peak.uv! ? hour : peak) : null;
  const peakValue = validUv(day?.uvMax) ? day.uvMax : peakHour?.uv;
  const peak = uvInfo(peakValue);
  // Only attach a time to a complete daily curve whose peak agrees with the daily summary.
  const peakTime = peak && peak.index > 0 && peakHour && uvInfo(peakHour.uv)?.index === peak.index ? peakHour.time : null;
  const lowFrom = !stale && complete && current && current.index >= 3
    ? hours.find((hour, index) => hour.time > seconds && hours.slice(index).every(next => uvInfo(next.uv)!.index < 3))?.time ?? null : null;
  return { current, hours, peak, peakTime, lowFrom, stale, today };
}
export type UvForecast = ReturnType<typeof uvForecast>;
