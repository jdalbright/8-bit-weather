import { describe, expect, it } from 'vitest';
import { asheville, fixtureTime, forecastFixture } from '../test/fixtures';
import { cacheWeather, cachedWeather } from './storage';
import { normalizeWeather } from './weather';
import { deriveHourlyScene } from './scene';
import { forecastHours, forecastTimeLabel, resolveForecastSelection } from './forecast-preview';

const snapshot = () => normalizeWeather(forecastFixture(), asheville, fixtureTime);
describe('forecast selection', () => {
  it('keeps Now and future steps within the same 24-hour rail, including partial and missing data', () => {
    const weather = snapshot();
    expect(forecastHours(weather, fixtureTime + 1800000)).toHaveLength(24);
    weather.hourly.splice(2, 1);
    expect(forecastHours(weather, fixtureTime)).toHaveLength(23);
    expect(forecastHours(weather, fixtureTime + 3 * 86400000)).toEqual([]);
    expect(forecastHours(null, fixtureTime)).toEqual([]);
  });
  it('preserves timestamps across refreshes and rejects elapsed, removed, and mismatched selections', () => {
    const weather = snapshot();
    const hour = weather.hourly[2];
    const selection = { placeId: asheville.id, latitude: asheville.latitude, longitude: asheville.longitude, time: hour.time };
    const refreshed = { ...weather, fetchedAt: fixtureTime + 60000 };
    expect(resolveForecastSelection(selection, asheville, refreshed, fixtureTime)).toBe(hour);
    expect(resolveForecastSelection(selection, asheville, weather, hour.time * 1000)).toBeNull();
    expect(resolveForecastSelection(selection, { ...asheville, latitude: 0 }, weather, fixtureTime)).toBeNull();
    expect(resolveForecastSelection(selection, { ...asheville, id: 'other' }, weather, fixtureTime)).toBeNull();
    expect(resolveForecastSelection(selection, asheville, { ...weather, longitude: 0 }, fixtureTime)).toBeNull();
    expect(resolveForecastSelection(selection, asheville, { ...weather, hourly: [] }, fixtureTime)).toBeNull();
  });
  it('distinguishes the repeated autumn hour and skips the missing spring hour', () => {
    const label = (iso: string) => forecastTimeLabel(Date.parse(iso) / 1000, 'America/New_York');
    expect(label('2026-11-01T05:00Z')).toContain('1:00 AM EDT');
    expect(label('2026-11-01T06:00Z')).toContain('1:00 AM EST');
    expect(label('2026-03-08T06:00Z')).toContain('1:00 AM EST');
    expect(label('2026-03-08T07:00Z')).toContain('3:00 AM EDT');
  });
});

describe('hourly scenes and compatible caches', () => {
  it('uses the preview hour even for saved weather, and does not mutate observations', () => {
    const weather = snapshot();
    const before = structuredClone(weather);
    const hour = { ...weather.hourly[1], time: weather.daily[0].sunset!, wind: 40, code: 65 };
    expect(deriveHourlyScene(weather, hour)).toMatchObject({ phase: 'dusk', daylight: .5, kind: 'rain', windStrength: 1, precipitationIntensity: 1 });
    expect(weather).toEqual(before);
  });
  it.each([['2026-11-01T12:00Z', '2026-11-01', 'America/New_York'], ['2026-11-01T21:00Z', '2026-11-02', 'Asia/Tokyo']])('selects solar data across DST or midnight: %s', (iso, date, timezone) => {
    const weather = snapshot();
    const time = Date.parse(iso) / 1000;
    weather.timezone = timezone;
    weather.daily = [{ ...weather.daily[0], date, sunrise: time, sunset: time + 36000 }];
    expect(deriveHourlyScene(weather, { ...weather.hourly[0], time })).toMatchObject({ phase: 'dawn', daylight: .5 });
  });
  it('uses the hourly day flag with absent solar data, and neutral values for absent weather and wind', () => {
    const weather = snapshot();
    weather.daily = [];
    expect(deriveHourlyScene(weather, { ...weather.hourly[0], isDay: false, code: null, wind: undefined })).toMatchObject({ phase: 'night', kind: 'unknown', wind: 0, precipitationIntensity: 0 });
  });
  it('normalizes hourly wind and accepts old caches without it, rejecting invalid cached wind', () => {
    const raw = forecastFixture();
    const weather = normalizeWeather({ ...raw, hourly: { ...raw.hourly, wind_speed_10m: [18, -1, null] } }, asheville, fixtureTime);
    expect(weather.hourly.slice(0, 4).map(h => h.wind)).toEqual([18, null, null, null]);
    cacheWeather(weather);
    expect(cachedWeather(asheville)?.hourly[0].wind).toBe(18);
    weather.hourly.forEach(h => { delete h.wind; });
    cacheWeather(weather);
    expect(cachedWeather(asheville)?.version).toBe(1);
    weather.hourly[0].wind = -1;
    cacheWeather(weather);
    expect(cachedWeather(asheville)).toBeNull();
  });
});
