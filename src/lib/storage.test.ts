import { describe, expect, it, vi } from 'vitest';
import { cacheWeather, cachedWeather, clearSavedData, defaultPreferences, loadState, saveState, STORAGE_KEY } from './storage';
import { normalizeWeather } from './weather';
import { asheville, forecastFixture } from '../test/fixtures';

describe('device persistence', () => {
  it('selects locale defaults and safely recovers from corrupt state', () => { expect(defaultPreferences('en-US').units).toBe('imperial'); expect(defaultPreferences('en-GB').units).toBe('metric'); localStorage.setItem(STORAGE_KEY, '{broken'); expect(loadState().selected).toBeNull(); });
  it('round-trips preferences and places and clears only this app’s data', () => {
    const preferences = { ...defaultPreferences('en-US'), musicVolume: 0.6, reducedMotion: true };
    saveState({ preferences, places: [asheville], selected: asheville });
    expect(loadState()).toEqual({ preferences, places: [asheville], selected: asheville });
    localStorage.setItem('another-app', 'keep'); clearSavedData(); expect(loadState().places).toEqual([]); expect(localStorage.getItem('another-app')).toBe('keep');
  });
  it('validates stored coordinates and clamps audio preferences', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected: { ...asheville, latitude: 900 }, places: [asheville, {}], preferences: { units: 'invalid', musicVolume: 8, ambience: 'yes' } }));
    const result = loadState(); expect(result.selected).toBeNull(); expect(result.places).toHaveLength(1); expect(result.preferences.musicVolume).toBe(1); expect(result.preferences.ambience).toBe(true);
  });
  it('caches a bounded history and refuses a changed GPS location', () => {
    const snapshot = normalizeWeather(forecastFixture(), asheville);
    cacheWeather(snapshot); expect(cachedWeather(asheville)).toEqual(snapshot); expect(cachedWeather({ ...asheville, longitude: 8 })).toBeNull();
    localStorage.setItem(`${STORAGE_KEY}:forecasts`, JSON.stringify([{ version: 1 }, null])); expect(cachedWeather(asheville)).toBeNull();
  });
  it('does not crash when browser storage is unavailable', () => { vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota'); }); expect(saveState({ preferences: defaultPreferences(), places: [], selected: null })).toBe(false); });
  it('reads older forecasts without rain data and rejects malformed rain caches', () => {
    const snapshot = normalizeWeather(forecastFixture(), asheville);
    delete snapshot.minutely;
    localStorage.setItem(`${STORAGE_KEY}:forecasts`, JSON.stringify([snapshot]));
    expect(cachedWeather(asheville)).toEqual(snapshot);
    for (const minutely of [{}, [null], [{ time: 1, amount: -1 }], [{ time: 'invalid', amount: 1 }]]) {
      localStorage.setItem(`${STORAGE_KEY}:forecasts`, JSON.stringify([{ ...snapshot, minutely }]));
      expect(cachedWeather(asheville)).toBeNull();
    }
  });
});
