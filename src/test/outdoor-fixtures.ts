import { asheville, fixtureTime, forecastFixture } from './fixtures';
import { normalizeWeather } from '../lib/weather';

export function outdoorForecast(now = fixtureTime) {
  const raw = forecastFixture(now);
  const times = Array.from({ length: 49 }, (_, i) => raw.hourly.time[0] + i * 3600);
  return { ...raw, hourly: { ...raw.hourly, time: times,
    temperature_2m: times.map(() => 22), precipitation_probability: times.map(() => 10),
    weather_code: times.map(() => 1), is_day: times.map(time => { const hour = new Date(time * 1000).getUTCHours(); return hour >= 11 && hour < 23 ? 1 : 0; }),
    uv_index: times.map(() => 3), wind_speed_10m: times.map(() => 8),
  } };
}

export function outdoorSnapshot(now = fixtureTime) {
  return { ...normalizeWeather(outdoorForecast(now), asheville, now), sectionTimes: { current: now, forecast: now } };
}
