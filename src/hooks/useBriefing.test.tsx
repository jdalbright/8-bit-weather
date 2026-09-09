import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useBriefing } from './useBriefing';
import { clearBriefingCache } from '../lib/briefing-client';
import { BRIEFING_STORAGE, BRIEFING_TTL, BRIEFING_VERSION } from '../lib/briefing';
import { clearSavedData } from '../lib/storage';
import { normalizeWeather } from '../lib/weather';
import { asheville, fixtureTime, forecastFixture, tokyo } from '../test/fixtures';

const snapshot = () => normalizeWeather(forecastFixture(), asheville, fixtureTime);
function answer(text = 'Mild today, with a small chance of showers.') {
  const now = Date.now();
  return { text, generatedAt: now, windowStart: now, windowEnd: now + 86400000, expiresAt: now + BRIEFING_TTL, version: BRIEFING_VERSION };
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
beforeEach(() => {
  clearBriefingCache(); vi.useFakeTimers(); vi.setSystemTime(fixtureTime);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => clearBriefingCache());
it('generates automatically once in StrictMode, displays immediately, and reuses results after navigation', async () => {
  const fetcher = vi.fn().mockImplementation(async () => { vi.setSystemTime(fixtureTime + 1500); return Response.json(answer()); });
  vi.stubGlobal('fetch', fetcher);
  const first = renderHook(() => useBriefing(snapshot(), 'imperial', true, fixtureTime), { wrapper: StrictMode });
  await flush();
  expect(fetcher).toHaveBeenCalledTimes(1); expect(first.result.current.briefing?.text).toContain('Mild');
  first.unmount();
  const second = renderHook(() => useBriefing(snapshot(), 'imperial', true, fixtureTime)); await flush();
  expect(second.result.current.briefing).not.toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
});
it('regenerates after expiry and when units change', async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json(answer())); vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(({ units, now }: { units: 'metric' | 'imperial'; now: number }) => useBriefing(snapshot(), units, true, now), { initialProps: { units: 'imperial', now: fixtureTime } });
  await flush();
  vi.setSystemTime(fixtureTime + BRIEFING_TTL);
  hook.rerender({ units: 'imperial', now: Date.now() }); await flush(); expect(fetcher).toHaveBeenCalledTimes(2);
  hook.rerender({ units: 'metric', now: Date.now() }); await flush(); expect(fetcher).toHaveBeenCalledTimes(3);
  expect(JSON.parse(fetcher.mock.calls[2][1].body).units).toBe('metric');
});
it('aborts superseded requests and ignores late responses for another place', async () => {
  let resolveOld!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce(Response.json(answer('Tokyo briefing.')));
  vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(({ s }) => useBriefing(s, 'imperial', true, fixtureTime), { initialProps: { s: snapshot() } });
  hook.rerender({ s: { ...snapshot(), placeId: tokyo.id, latitude: tokyo.latitude, longitude: tokyo.longitude } }); await flush();
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => { resolveOld(Response.json(answer('Old place.'))); });
  expect(hook.result.current.briefing?.text).toBe('Tokyo briefing.');
});
it('keeps a saved briefing offline until its window ends without generating', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(answer())); vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(({ online, now }) => useBriefing(snapshot(), 'imperial', online, now), { initialProps: { online: true, now: fixtureTime } });
  await flush(); vi.setSystemTime(fixtureTime + 2 * 3600000);
  hook.rerender({ online: false, now: Date.now() }); await flush();
  expect(hook.result.current.briefing).not.toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  vi.setSystemTime(fixtureTime + 86400000); hook.rerender({ online: false, now: Date.now() });
  expect(hook.result.current.briefing).toBeNull();
});
it('does not generate for stale forecasts or hidden documents', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  const hook = renderHook(() => useBriefing(snapshot(), 'imperial', true, fixtureTime)); await flush();
  expect(fetcher).not.toHaveBeenCalled(); hook.unmount();
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  vi.setSystemTime(fixtureTime + 45 * 60000);
  renderHook(() => useBriefing(snapshot(), 'imperial', true, Date.now())); await flush(); expect(fetcher).not.toHaveBeenCalled();
});
it('honors cooldowns without automatic retry loops and supports explicit retry', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '120' } }))
    .mockImplementation(async () => Response.json(answer())); vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(({ now }) => useBriefing(snapshot(), 'imperial', true, now), { initialProps: { now: fixtureTime } });
  await flush(); expect(hook.result.current.error?.code).toBe('rate_limited'); expect(hook.result.current.canRetry).toBe(false);
  vi.setSystemTime(fixtureTime + 120000); hook.rerender({ now: Date.now() }); await flush();
  expect(hook.result.current.canRetry).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
  act(() => hook.result.current.retry()); await flush(); expect(fetcher).toHaveBeenCalledTimes(2); expect(hook.result.current.briefing).not.toBeNull();
});
it('does not reuse an earlier retry click after a later failure and visibility change', async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response('', { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(({ now }) => useBriefing(snapshot(), 'imperial', true, now), { initialProps: { now: fixtureTime } });
  await flush();
  vi.setSystemTime(fixtureTime + 60000); hook.rerender({ now: Date.now() });
  act(() => hook.result.current.retry()); await flush(); expect(fetcher).toHaveBeenCalledTimes(2);
  vi.setSystemTime(fixtureTime + 120000); hook.rerender({ now: Date.now() });
  act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await flush(); expect(fetcher).toHaveBeenCalledTimes(2);
  expect(hook.result.current.error).toBeDefined();
});
it('uses memory when storage fails and clears both stored and pending briefings', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
  const fetcher = vi.fn().mockImplementation(async () => Response.json(answer())); vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(() => useBriefing(snapshot(), 'imperial', true, fixtureTime)); await flush();
  expect(hook.result.current.briefing).not.toBeNull(); hook.unmount(); clearSavedData();
  expect(localStorage.getItem(BRIEFING_STORAGE)).toBeNull();
  renderHook(() => useBriefing(snapshot(), 'imperial', true, fixtureTime)); await flush(); expect(fetcher).toHaveBeenCalledTimes(2);
});
it('handles Vercel firewall HTML 429 responses without Retry-After and shares the cooldown across units', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('<html>Too Many Requests</html>', { status: 429, headers: { 'Content-Type': 'text/html' } }));
  vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(({ units }: { units: 'imperial' | 'metric' }) => useBriefing(snapshot(), units, true, fixtureTime), { initialProps: { units: 'imperial' } });
  await flush();
  expect(hook.result.current.error?.code).toBe('rate_limited');
  expect(hook.result.current.error?.retryAt).toBe(fixtureTime + 60000);
  expect(hook.result.current.canRetry).toBe(false);
  hook.rerender({ units: 'metric' }); await flush();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(hook.result.current.error?.code).toBe('rate_limited');
});
it('rejects malformed responses and keeps errors local to the briefing', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ text: 'missing provenance' })));
  const hook = renderHook(() => useBriefing(snapshot(), 'imperial', true, fixtureTime)); await flush();
  expect(hook.result.current.briefing).toBeNull(); expect(hook.result.current.error).toBeDefined();
});
it('times out a hanging request and stops its loading state', async () => {
  vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  })));
  const hook = renderHook(() => useBriefing(snapshot(), 'imperial', true, fixtureTime));
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(hook.result.current.loading).toBe(false); expect(hook.result.current.error).toBeDefined();
});
it('does not let a late response repopulate data after Clear saved data', async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  const hook = renderHook(() => useBriefing(snapshot(), 'imperial', true, fixtureTime));
  hook.unmount(); clearSavedData();
  await act(async () => { resolve(Response.json(answer())); });
  expect(localStorage.getItem(BRIEFING_STORAGE)).toBeNull();
});
