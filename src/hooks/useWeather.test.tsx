import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWeather } from './useWeather';
import { fetchWeather, WeatherRequestError } from '../lib/api';
import { normalizeWeather as normalizeLegacyWeather } from '../lib/weather';
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

it('retains the latest live forecast when storage fails, including offline resume and failed refresh', async () => {
  const old = normalizeWeather(forecastFixture(Date.now()), asheville, Date.now() - 3600000);
  cacheWeather(old);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
  const fresh = normalizeWeather(forecastFixture(Date.now()), asheville);
  mockedFetch.mockResolvedValueOnce(fresh);
  const { result } = renderHook(() => useWeather(asheville));
  await waitFor(() => expect(result.current.snapshot).toEqual(fresh));
  mockedFetch.mockRejectedValueOnce(new Error('Network failed'));
  await act(async () => result.current.refresh(true));
  expect(result.current.snapshot).toEqual(fresh);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  await act(async () => { window.dispatchEvent(new Event('offline')); document.dispatchEvent(new Event('visibilitychange')); });
  expect(result.current.snapshot).toEqual(fresh); expect(result.current.error).toBeNull();
});
it('retains an uncached forecast offline but never leaks it to another location', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  const fresh = normalizeWeather(forecastFixture(Date.now()), asheville);
  mockedFetch.mockResolvedValueOnce(fresh);
  const { result, rerender } = renderHook(({ place }) => useWeather(place), { initialProps: { place: asheville } });
  await waitFor(() => expect(result.current.snapshot).toEqual(fresh));
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await act(async () => result.current.refresh());
  expect(result.current.snapshot).toEqual(fresh);
  rerender({ place: tokyo });
  expect(result.current.snapshot).toBeNull();
});

it('signals manual request start only for a real fetch, not cached, offline, or rate-limited returns', async () => {
  const fresh = normalizeWeather(forecastFixture(Date.now()), asheville);
  cacheWeather(fresh); mockedFetch.mockResolvedValue(fresh);
  const started = vi.fn(); const { result } = renderHook(() => useWeather(asheville));
  await act(async () => result.current.refresh(false, started)); expect(started).not.toHaveBeenCalled();
  await act(async () => result.current.refresh(true, started)); expect(started).toHaveBeenCalledOnce();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await act(async () => result.current.refresh(true, started)); expect(started).toHaveBeenCalledOnce();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  mockedFetch.mockRejectedValueOnce(new WeatherRequestError('Rate limited', 60000));
  await act(async () => result.current.refresh(true, started)); expect(started).toHaveBeenCalledTimes(2);
  await act(async () => result.current.refresh(true, started)); expect(started).toHaveBeenCalledTimes(2);
});

it('returns explicit outcomes for completed, failed, and skipped refreshes', async () => {
  const fresh = normalizeWeather(forecastFixture(Date.now()), asheville);
  cacheWeather(fresh); mockedFetch.mockResolvedValue(fresh);
  const { result } = renderHook(() => useWeather(asheville));
  await act(async () => { expect(await result.current.refresh()).toBe('skipped'); });
  await act(async () => { expect(await result.current.refresh(true)).toBe('success'); });
  mockedFetch.mockRejectedValueOnce(new WeatherRequestError('Busy', 60000));
  await act(async () => { expect(await result.current.refresh(true)).toBe('failure'); });
  await act(async () => { expect(await result.current.refresh(true)).toBe('skipped'); });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await act(async () => { expect(await result.current.refresh(true)).toBe('skipped'); });
});
it.each(['resolve', 'reject'] as const)('returns cancelled for a superseded manual request that later %ss', async outcome => {
  const fresh = normalizeWeather(forecastFixture(Date.now()), asheville);
  cacheWeather(fresh); cacheWeather(normalizeWeather(forecastFixture(Date.now()), tokyo));
  let resolve!: (snapshot: WeatherSnapshot) => void, reject!: (error: Error) => void;
  mockedFetch.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
  const { result, rerender } = renderHook(({ place }) => useWeather(place), { initialProps: { place: asheville } });
  let pending!: ReturnType<typeof result.current.refresh>;
  act(() => { pending = result.current.refresh(true); });
  rerender({ place: tokyo });
  await act(async () => {
    if (outcome === 'resolve') resolve(fresh); else reject(new Error('Late failure'));
    expect(await pending).toBe('cancelled');
  });
  expect(result.current.snapshot?.placeId).toBe(tokyo.id);
});


it('rechecks an open app at the next provider interval and replaces cached rain with dry weather', async () => {
  vi.useFakeTimers();
  const start = Date.parse('2026-09-11T18:14:00Z');
  vi.setSystemTime(start);
  const wet = normalizeWeather(forecastFixture(start, 61), asheville, start);
  const dry = normalizeWeather(forecastFixture(start + 60000, 3), asheville, start + 60000);
  cacheWeather(wet);
  mockedFetch.mockResolvedValue(dry);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const { result } = renderHook(() => useWeather(asheville));
  expect(result.current.snapshot?.current.code).toBe(61);
  expect(mockedFetch).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(mockedFetch).toHaveBeenCalledOnce();
  expect(result.current.snapshot?.current.code).toBe(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(mockedFetch).toHaveBeenCalledOnce();
});

function normalizeWeather(...args: Parameters<typeof normalizeLegacyWeather>) {
  const s = normalizeLegacyWeather(...args);
  return { ...s, current: { ...s.current, precipitationProbability: null }, provider: 'xweather' as const, sectionTimes: { current: s.fetchedAt, forecast: s.fetchedAt },
    refreshAfter: Math.min(s.fetchedAt+600000,Math.max(s.current.time*1000+900000,s.fetchedAt+60000)) };
}

it('keeps a legacy saved forecast visible while requesting Xweather on first online use',async()=> {
  const old=normalizeLegacyWeather(forecastFixture(Date.now()),asheville);
  cacheWeather(old);
  let complete!: (s:WeatherSnapshot)=>void;
  mockedFetch.mockImplementation(()=>new Promise(resolve=>complete=resolve));
  const {result}=renderHook(()=>useWeather(asheville));
  expect(result.current.snapshot?.provider).toBeUndefined();
  expect(mockedFetch).toHaveBeenCalledOnce();
  await act(async()=>complete(normalizeWeather(forecastFixture(Date.now()),asheville)));
  expect(result.current.snapshot?.provider).toBe('xweather');
});

it('refreshes older Xweather snapshots missing current probability once, preserving saved data until success', async () => {
  const old: WeatherSnapshot = normalizeWeather(forecastFixture(Date.now(), 95), asheville);
  delete old.current.precipitationProbability;
  cacheWeather(old);
  const fresh = { ...old, current: { ...old.current, code: 2, precipitationProbability: 0 } };
  mockedFetch.mockResolvedValue(fresh);
  const { result } = renderHook(() => useWeather(asheville));
  await waitFor(() => expect(result.current.snapshot?.current.precipitationProbability).toBe(0));
  expect(result.current.snapshot?.current.code).toBe(2);
  await act(async () => result.current.refresh());
  expect(mockedFetch).toHaveBeenCalledTimes(1);
});
