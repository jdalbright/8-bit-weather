import { describe, expect, it } from 'vitest';
import { currentWeatherCode, currentWeatherInfo, isFresh, normalizeWeather } from './weather';
import { deriveHourlyScene, deriveScene } from './scene';
import { asheville, fixtureTime, forecastFixture } from '../test/fixtures';
import { cachedWeather, cacheWeather, STORAGE_KEY } from './storage';
import { widgetPayload } from './widget';

function snapshot(code = 61, rain: unknown = 0, showers: unknown = 0, cloudCover: unknown = 100) {
  const raw = forecastFixture(fixtureTime, code);
  return normalizeWeather({ ...raw, current: { ...raw.current, rain, showers, cloud_cover: cloudCover } }, asheville, fixtureTime);
}

describe('current model conditions', () => {
  it('uses the same dry reading for the headline, scene, audio input, and widget without rewriting forecasts', () => {
    const weather = snapshot();
    expect(currentWeatherInfo(weather.current)).toEqual({ kind: 'cloudy', label: 'Overcast' });
    expect(deriveScene(weather, fixtureTime)).toMatchObject({ kind: 'cloudy', precipitationIntensity: 0 });
    expect(widgetPayload(asheville, 'imperial', weather).weather?.current.code).toBe(3);
    expect(weather.current.code).toBe(61);
    expect(deriveHourlyScene(weather, weather.hourly[1])).toMatchObject({ kind: 'rain' });
  });
  it.each([[0, 0], [19, 0], [20, 1], [49, 1], [50, 2], [79, 2], [80, 3], [100, 3]])('uses %s percent cloud cover for a dry current code', (clouds, code) => {
    expect(currentWeatherCode(snapshot(61, 0, 0, clouds).current)).toBe(code);
  });
  it.each([undefined, null, -1, '0', NaN])('does not interpret missing/invalid rain amounts as dry: %s', value => {
    // Explicitly override the default argument when testing undefined.
    const raw = forecastFixture(fixtureTime, 61);
    for (const fields of [{ rain: value, showers: 0 }, { rain: 0, showers: value }]) {
      const weather = normalizeWeather({ ...raw, current: { ...raw.current, ...fields, cloud_cover: 100 } }, asheville, fixtureTime);
      expect(currentWeatherCode(weather.current)).toBe(61);
    }
  });
  it.each([null, -1, 101, '100', NaN])('does not invent cloud conditions for invalid cover: %s', clouds => {
    expect(currentWeatherCode(snapshot(61, 0, 0, clouds).current)).toBe(61);
  });
  it.each([45, 48, 56, 57, 66, 67, 71, 73, 75, 77, 85, 86, 95, 96, 99])('preserves fog, freezing precipitation, snow and storm code %s', code => {
    expect(currentWeatherCode(snapshot(code).current)).toBe(code);
  });
  it('keeps nonzero rain, including drizzle, without adding possible', () => {
    expect(currentWeatherInfo(snapshot(51, 0.01).current).label).toBe('Light drizzle');
    expect(currentWeatherInfo(snapshot(63, 0.4).current).label).toBe('Rain');
    expect(currentWeatherCode(snapshot(80, 0, 0.2).current)).toBe(80);
    expect(deriveScene(snapshot(61, 0.1), fixtureTime).precipitationIntensity).toBeGreaterThan(0);
  });
  it('does not use future rain or a high probability as evidence of rain now', () => {
    const weather = snapshot();
    weather.hourly.forEach(hour => { hour.precipitation = 100; });
    weather.minutely!.forEach(period => { period.amount = 3; });
    expect(currentWeatherInfo(weather.current).label).toBe('Overcast');
  });
  it('refreshes at the provider interval boundary even after a recent fetch, with a retry floor', () => {
    const weather = snapshot();
    weather.fetchedAt = fixtureTime + 14 * 60000;
    expect(isFresh(weather, fixtureTime + 14.5 * 60000)).toBe(true);
    expect(isFresh(weather, fixtureTime + 15 * 60000)).toBe(false);
    weather.fetchedAt = fixtureTime + 15 * 60000;
    expect(isFresh(weather, fixtureTime + 15.5 * 60000)).toBe(true);
    expect(isFresh(weather, fixtureTime + 16 * 60000)).toBe(false);
  });
  it('retains optional evidence through caching and rejects invalid stored measurements', () => {
    const weather = snapshot();
    cacheWeather(weather);
    expect(currentWeatherCode(cachedWeather(asheville)!.current)).toBe(3);
    for (const fields of [{ rain: -1 }, { showers: '0' }, { cloudCover: 101 }]) {
      localStorage.setItem(`${STORAGE_KEY}:forecasts`, JSON.stringify([{ ...weather, current: { ...weather.current, ...fields } }]));
      expect(cachedWeather(asheville)).toBeNull();
    }
    delete weather.current.rain; delete weather.current.showers; delete weather.current.cloudCover;
    cacheWeather(weather);
    expect(currentWeatherCode(cachedWeather(asheville)!.current)).toBe(61);
  });
});

it('keeps cached chance-only labels out of the headline and widget at zero forecast probability', () => {
  const weather = snapshot(3);
  weather.current.conditionLabel = 'Thunderstorms possible';
  weather.hourly.forEach(hour => { hour.precipitation = 0; });
  expect(currentWeatherInfo(weather.current)).toEqual({ kind: 'cloudy', label: 'Overcast' });
  expect(deriveScene(weather, fixtureTime)).toMatchObject({ kind: 'cloudy', precipitationIntensity: 0 });
  expect(widgetPayload(asheville, 'imperial', weather).weather?.current).toMatchObject({ code: 3, conditionLabel: 'Overcast' });
});
it('does not erase reported active thunderstorms just because hourly forecast probability is zero', () => {
  const weather = snapshot(95, 1);
  weather.hourly.forEach(hour => { hour.precipitation = 0; });
  expect(currentWeatherInfo(weather.current)).toEqual({ kind: 'storm', label: 'Thunderstorms' });
  expect(deriveScene(weather, fixtureTime).kind).toBe('storm');
});
