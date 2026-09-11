import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useRadar } from './useRadar';
import { fetchRadarManifest, RADAR_REFRESH, RadarRequestError, radarRegions, type RadarManifest, type RadarLayer } from '../lib/radar';
vi.mock('../lib/radar', async original => ({ ...await original<typeof import('../lib/radar')>(), fetchRadarManifest: vi.fn() }));
const fetch = vi.mocked(fetchRadarManifest);
const manifest = (layer: RadarLayer = 'intensity'): RadarManifest => ({ region: radarRegions[0], layer, bounds: radarRegions[0].bounds, fetchedAt: Date.now(), frames: [{ time: Date.now() }] });
beforeEach(() => { fetch.mockReset(); });
it('does no work without a region, connectivity, or an active view', () => {
  const { rerender } = renderHook(({ active, online }) => useRadar(radarRegions[0], 'intensity', active, online), { initialProps: { active: false, online: true } });
  rerender({ active: true, online: false });
  renderHook(() => useRadar(null, 'intensity', true, true));
  expect(fetch).not.toHaveBeenCalled();
});
it('aborts requests and discards late results when switching layers', async () => {
  let finish!: (result: RadarManifest) => void;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(manifest('type'));
  const { result, rerender } = renderHook(({ layer }) => useRadar(radarRegions[0], layer, true, true), { initialProps: { layer: 'intensity' as RadarLayer } });
  const signal = fetch.mock.calls[0][2];
  rerender({ layer: 'type' });
  await waitFor(() => expect(result.current.manifest?.layer).toBe('type'));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(manifest()));
  expect(result.current.manifest?.layer).toBe('type');
});
it('refreshes every two minutes and stops while backgrounded or unmounted', async () => {
  vi.useFakeTimers(); fetch.mockResolvedValue(manifest());
  const { rerender, unmount } = renderHook(({ active }) => useRadar(radarRegions[0], 'intensity', active, true), { initialProps: { active: true } });
  await act(async () => {});
  await act(async () => vi.advanceTimersByTimeAsync(RADAR_REFRESH)); expect(fetch).toHaveBeenCalledTimes(2);
  rerender({ active: false });
  await act(async () => vi.advanceTimersByTimeAsync(RADAR_REFRESH * 3)); expect(fetch).toHaveBeenCalledTimes(2);
  rerender({ active: true }); await act(async () => {}); expect(fetch).toHaveBeenCalledTimes(3);
  unmount(); await act(async () => vi.advanceTimersByTimeAsync(RADAR_REFRESH)); expect(fetch).toHaveBeenCalledTimes(3);
});
it('retains existing observations on failure and honors a cooldown even for manual refresh', async () => {
  fetch.mockResolvedValueOnce(manifest());
  const { result } = renderHook(() => useRadar(radarRegions[0], 'intensity', true, true));
  await waitFor(() => expect(result.current.manifest).not.toBeNull());
  fetch.mockRejectedValue(new RadarRequestError('Radar busy', 180000));
  await act(async () => result.current.refresh());
  expect(result.current.error).toBe('Radar busy'); expect(result.current.manifest).not.toBeNull();
  await act(async () => result.current.refresh()); expect(fetch).toHaveBeenCalledTimes(2);
});
