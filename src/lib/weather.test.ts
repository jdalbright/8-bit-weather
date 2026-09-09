import { describe, expect, it } from 'vitest';
import { cacheMatches, dayLabel, futureDays, isFresh, localDate, localTime, normalizeWeather, percent, precipitationForHour, temperature, updatedLabel, weatherInfo, windSpeed } from './weather';
import { asheville, fixtureTime, forecastFixture } from '../test/fixtures';

describe('forecast interpretation', () => {
  it.each([[0, 'clear'], [2, 'partly-cloudy'], [3, 'cloudy'], [48, 'fog'], [57, 'rain'], [67, 'rain'], [77, 'snow'], [86, 'snow'], [99, 'storm']] as const)('maps WMO %s to %s', (code, kind) => expect(weatherInfo(code).kind).toBe(kind));
  it('uses nighttime language and a safe unknown state', () => { expect(weatherInfo(1, false).label).toBe('Mostly clear'); expect(weatherInfo(null).kind).toBe('unknown'); expect(weatherInfo(500).kind).toBe('unknown'); });
  it('preserves missing measurements instead of inventing zero', () => {
    const raw = forecastFixture();
    const data = { ...raw, current: { ...raw.current, temperature_2m: null }, hourly: { ...raw.hourly, precipitation_probability: [null, 0] } };
    const result = normalizeWeather(data, asheville, fixtureTime);
    expect(result.current.temperature).toBeNull(); expect(result.hourly[0].precipitation).toBeNull(); expect(result.hourly[1].precipitation).toBe(0);
    expect(temperature(result.current.temperature, 'imperial')).toBe('—'); expect(percent(null)).toBe('—'); expect(percent(0)).toBe('0%');
  });
  it('rejects incomplete responses and invalid timezones', () => { expect(() => normalizeWeather({}, asheville)).toThrow('incomplete'); expect(() => normalizeWeather({ ...forecastFixture(), timezone: 'not/a-zone' }, asheville)).toThrow('time zone'); });
  it('keeps city dates independent of the device timezone', () => {
    const moment = Date.parse('2026-09-08T01:00:00Z');
    expect(localDate(moment, 'America/New_York')).toBe('2026-09-07'); expect(localDate(moment, 'Asia/Tokyo')).toBe('2026-09-08');
  });
  it('formats both occurrences of the repeated DST hour correctly', () => {
    const before = Date.parse('2026-11-01T05:00:00Z') / 1000, after = before + 3600;
    expect(localTime(before, 'America/New_York', { hour: 'numeric' })).toBe('1 AM'); expect(localTime(after, 'America/New_York', { hour: 'numeric' })).toBe('1 AM');
    expect(localDate(before * 1000, 'America/New_York')).toBe('2026-11-01');
  });
  it('removes expired daily forecasts without relabeling them as today', () => {
    const snapshot = normalizeWeather(forecastFixture(), asheville, fixtureTime);
    const result = futureDays(snapshot.daily, snapshot.timezone, fixtureTime + 2 * 86400000);
    expect(result).toHaveLength(5); expect(result[0].date).toBe('2026-09-09'); expect(futureDays(snapshot.daily, snapshot.timezone, fixtureTime + 8 * 86400000)).toEqual([]);
  });
  it('converts the same underlying values without another request', () => { expect(temperature(0, 'imperial')).toBe('32°'); expect(temperature(0, 'metric')).toBe('0°'); expect(temperature(-40, 'metric')).toBe('-40°'); expect(windSpeed(16.09344, 'imperial')).toBe('10 mph'); expect(windSpeed(null, 'metric')).toBe('—'); });
  it('bounds freshness and never reuses GPS weather at different coordinates', () => {
    const snapshot = normalizeWeather(forecastFixture(), asheville, fixtureTime);
    expect(isFresh(snapshot, fixtureTime + 14 * 60000)).toBe(true); expect(isFresh(snapshot, fixtureTime + 15 * 60000)).toBe(false); expect(isFresh(snapshot, fixtureTime - 60000)).toBe(false);
    expect(cacheMatches(snapshot, asheville)).toBe(true); expect(cacheMatches(snapshot, { ...asheville, latitude: 40 })).toBe(false);
    expect(updatedLabel(fixtureTime, fixtureTime + 2 * 86400000)).toBe('Updated 2 days ago');
  });
});

describe('provider interval and calendar conventions', () => {
  it('preserves real provider dates across the autumn clock change', () => {
    const raw = forecastFixture();
    raw.daily.time = [1761969600, 1762056000, 1762142400, 1762228800];
    const result = normalizeWeather(raw, asheville);
    expect(result.daily.map(day => day.date)).toEqual(['2025-11-01', '2025-11-02', '2025-11-03', '2025-11-04']);
    expect(result.daily.map(day => dayLabel(day.date))).toEqual(['Sat', 'Sun', 'Mon', 'Tue']);
  });
  it('does not substitute an earlier probability when the next interval is missing', () => {
    const data = normalizeWeather(forecastFixture(), asheville);
    data.hourly[0].precipitation = 10; data.hourly[1].precipitation = 80;
    expect(precipitationForHour(data.hourly, data.hourly[0].time)).toBe(80);
    data.hourly.splice(1, 1);
    expect(precipitationForHour(data.hourly, data.hourly[0].time)).toBeNull();
    expect(precipitationForHour(data.hourly, undefined)).toBeNull();
  });
});
