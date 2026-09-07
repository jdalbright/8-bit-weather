import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWeather } from './useWeather';
import { fetchWeather, WeatherRequestError } from '../lib/api';
import { normalizeWeather } from '../lib/weather';
import { cacheWeather } from '../lib/storage';
import { asheville, forecastFixture, tokyo } from '../test/fixtures';
import type { WeatherSnapshot } from '../types';
vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../lib/api')>(), fetchWeather: vi.fn() }));
const mockedFetch = vi.mocked(fetchWeather);
beforeEach(() => { mockedFetch.mockReset(); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); });
describe('weather request lifecycle', () => {
  it('ignores a late response after the selected place changes', async () => {
    let first!: (value: WeatherSnapshot) => void, second!: (value: WeatherSnapshot) => void;
    mockedFetch.mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
    const { result, rerender } = renderHook(({ place }) => useWeather(place), { initialProps: { place: asheville } });
    rerender({ place: tokyo });
    await act(async () => second(normalizeWeather(forecastFixture(Date.now()), tokyo)));
    expect(result.current.snapshot?.placeId).toBe(tokyo.id);
    await act(async () => first(normalizeWeather(forecastFixture(Date.now()), asheville)));
    expect(result.current.snapshot?.placeId).toBe(tokyo.id);
  });
  it('loads a fresh cached forecast without wasting an API request', async () => {
    cacheWeather(normalizeWeather(forecastFixture(Date.now()), asheville));
    const { result } = renderHook(() => useWeather(asheville));
    await waitFor(() => expect(result.current.snapshot).not.toBeNull()); expect(mockedFetch).not.toHaveBeenCalled();
  });
  it('keeps stale data visible on failure and honors a rate-limit cooldown', async () => {
    cacheWeather(normalizeWeather(forecastFixture(Date.now()), asheville, Date.now() - 3600000));
    mockedFetch.mockRejectedValue(new WeatherRequestError('Service busy', 60000));
    const { result } = renderHook(() => useWeather(asheville));
    await waitFor(() => expect(result.current.error).toBe('Service busy')); expect(result.current.snapshot).not.toBeNull();
    await act(async () => result.current.refresh(true)); expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
  it('does not label another place’s cached weather as the selected place when offline', async () => {
    cacheWeather(normalizeWeather(forecastFixture(Date.now()), asheville));
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const { result } = renderHook(() => useWeather(tokyo));
    await waitFor(() => expect(result.current.error).toContain('offline')); expect(result.current.snapshot).toBeNull(); expect(mockedFetch).not.toHaveBeenCalled();
  });
});
