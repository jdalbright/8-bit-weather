import type { Place } from '../types';

export const asheville: Place = { id: '4453066', name: 'Asheville', region: 'North Carolina', country: 'United States', latitude: 35.5951, longitude: -82.5515, source: 'search' };
export const tokyo: Place = { id: '1850147', name: 'Tokyo', region: 'Tokyo', country: 'Japan', latitude: 35.6895, longitude: 139.6917, source: 'search' };
export const fixtureTime = Date.parse('2026-09-07T14:00:00Z');
export function forecastFixture(now = fixtureTime, code = 1, isDay = 1) {
  const hour = Math.floor(now / 3600000) * 3600;
  const date = new Date(now).toISOString().slice(0, 10);
  const midnight = Date.parse(`${date}T04:00:00Z`) / 1000;
  return {
    timezone: 'America/New_York', utc_offset_seconds: -14400,
    minutely_15: {
      time: Array.from({ length: 16 }, (_, i) => Math.floor(now / 900000) * 900 + i * 900),
      rain: Array.from({ length: 16 }, () => 0),
      showers: Array.from({ length: 16 }, () => 0),
    },
    current: { time: hour, temperature_2m: 22.2, apparent_temperature: 23.3, relative_humidity_2m: 64, wind_speed_10m: 8.05, weather_code: code, is_day: isDay, uv_index: isDay ? 4.1 : 0 },
    hourly: {
      time: Array.from({ length: 48 }, (_, i) => hour + i * 3600),
      temperature_2m: Array.from({ length: 48 }, (_, i) => 22.2 + Math.sin(i / 4) * 3),
      precipitation_probability: Array.from({ length: 48 }, (_, i) => i % 5 * 5),
      weather_code: Array.from({ length: 48 }, () => code),
      is_day: Array.from({ length: 48 }, (_, i) => (i + 10) % 24 >= 7 && (i + 10) % 24 < 20 ? 1 : 0),
      uv_index: Array.from({ length: 48 }, (_, i) => Math.max(0, 7 - Math.abs((i + 10) % 24 - 13) * 1.4)),
    },
    daily: {
      time: Array.from({ length: 7 }, (_, i) => midnight + i * 86400),
      temperature_2m_max: [25, 25.6, 22.8, 22.2, 24.4, 26.1, 26.7],
      temperature_2m_min: [15, 15.6, 16.1, 14.4, 13.9, 15, 16.1],
      precipitation_probability_max: [10, 15, 70, 40, 5, 5, 15],
      weather_code: [1, 2, 63, 80, 0, 0, 2],
      sunrise: Array.from({ length: 7 }, (_, i) => midnight + i * 86400 + 7 * 3600),
      sunset: Array.from({ length: 7 }, (_, i) => midnight + i * 86400 + 19 * 3600),
      uv_index_max: [7, 6, 4, 3, 7, 8, 8],
    },
  };
}

export function uvFixture() {
  const raw = forecastFixture();
  const midnight = raw.daily.time[0];
  const hours = Array.from({ length: 48 }, (_, i) => midnight + i * 3600);
  return { ...raw, hourly: { ...raw.hourly, time: hours,
    uv_index: hours.map((_, i) => Math.max(0, 7 - Math.abs(i % 24 - 13) * 1.4)) } };
}
