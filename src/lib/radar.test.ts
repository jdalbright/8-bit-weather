import { describe, expect, it, vi } from 'vitest';
import { parseRadarCapabilities, radarImageUrl, radarRegions, regionForPlace, sampleFrames, type RadarLayer } from './radar';
import { RadarImageCache } from './radar-images';

const now = Date.parse('2026-09-11T18:00:00Z');
const region = radarRegions[0];
function capabilities(times: string, layer: RadarLayer = 'intensity') {
  return `<WMS_Capabilities xmlns="http://www.opengis.net/wms"><Capability><Layer><Layer><Name>conus_${layer === 'intensity' ? 'bref_qcd' : 'pcpn_typ'}</Name><EX_GeographicBoundingBox><westBoundLongitude>-130</westBoundLongitude><southBoundLatitude>20</southBoundLatitude><eastBoundLongitude>-60</eastBoundLongitude><northBoundLatitude>55</northBoundLatitude></EX_GeographicBoundingBox><Dimension name="time">${times}</Dimension></Layer></Layer></Capability></WMS_Capabilities>`;
}
describe('radar observations', () => {
  it('reads namespaced capabilities, preserves actual irregular timestamps, and caps history at 25 frames', () => {
    const times = Array.from({ length: 90 }, (_, i) => new Date(now - i * 120_000 - i % 3 * 1000).toISOString());
    const result = parseRadarCapabilities(capabilities(times.join(',')), region, 'intensity', now);
    expect(result.frames).toHaveLength(25);
    expect(result.frames.at(-1)?.time).toBe(now);
    expect(result.frames[0].time).toBeGreaterThanOrEqual(now - 7_200_000);
    expect(result.frames.every(frame => times.includes(new Date(frame.time).toISOString()))).toBe(true);
    expect(result.bounds).toEqual([-130, 20, -60, 55]);
  });
  it('accepts bounded ISO interval dimensions and retains a lone observation', () => {
    const result = parseRadarCapabilities(capabilities('2026-09-11T16:00:00Z/2026-09-11T18:00:00Z/PT2M'), region, 'intensity', now);
    expect(result.frames).toHaveLength(25);
    expect(sampleFrames([now], now)).toEqual([{ time: now }]);
  });
  it('rejects malformed, wrong-layer and empty capabilities without inventing timestamps', () => {
    for (const xml of ['<broken', capabilities('garbage'), capabilities('2026-09-11T18:00:00Z', 'type'), capabilities('2026-09-11T16:00:00Z/2026-09-11T18:00:00Z/PT0M')]) {
      expect(() => parseRadarCapabilities(xml, region, 'intensity', now)).toThrow();
    }
    expect(sampleFrames([NaN, 0, now, now, now + 3600000], now)).toEqual([{ time: now }]);
  });
  it('selects U.S. regional networks and explicitly declines unsupported or missing places', () => {
    for (const [latitude, longitude, id] of [[35.8, -78.6, 'conus'], [61.2, -149.9, 'alaska'], [21.3, -157.8, 'hawaii'], [18.5, -66.1, 'carib'], [13.4, 144.8, 'guam']] as const) expect(regionForPlace({ latitude, longitude })?.id).toBe(id);
    expect(regionForPlace({ latitude: 35.7, longitude: 139.7 })).toBeNull();
    expect(regionForPlace({ latitude: NaN, longitude: -78 })).toBeNull();
    expect(regionForPlace(null)).toBeNull();
  });
  it('requests explicit observation time and correctly ordered Web Mercator bounds', () => {
    const manifest = parseRadarCapabilities(capabilities('2026-09-11T18:00:00Z', 'type'), region, 'type', now);
    const url = new URL(radarImageUrl(manifest, { time: now }, [0, 0, 1, 1], 4000, 512));
    expect(url.searchParams.get('time')).toBe('2026-09-11T18:00:00.000Z');
    expect(url.searchParams.get('layers')).toBe('conus_pcpn_typ');
    expect(url.searchParams.get('styles')).toBe('radar_precip_type');
    expect(url.searchParams.get('srs')).toBe('EPSG:3857');
    expect(url.searchParams.get('width')).toBe('1024');
    const bounds = url.searchParams.get('bbox')!.split(',').map(Number);
    expect(bounds[0]).toBe(0); expect(bounds[1]).toBeCloseTo(0);
    expect(bounds[2]).toBeCloseTo(111319.4908); expect(bounds[3]).toBeCloseTo(111325.1429);
  });
  it('reports rate limiting and aborts stalled requests', async () => {
    vi.resetModules();
    const { fetchRadarManifest } = await import('./radar');
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '180' } })));
    await expect(fetchRadarManifest(region, 'intensity', new AbortController().signal)).rejects.toMatchObject({ retryAfter: 180000 });
    await vi.advanceTimersByTimeAsync(180000);
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))));
    const pending = fetchRadarManifest(region, 'intensity', new AbortController().signal);
    const assertion = expect(pending).rejects.toThrow('Couldn’t reach');
    await vi.advanceTimersByTimeAsync(12000); await assertion;
  });
  it('shares imagery rate-limit cooldowns across prefetches, cache remounts and metadata retries', async () => {
    vi.resetModules();
    const { RadarImageCache: Images } = await import('./radar-images');
    const { fetchRadarManifest } = await import('./radar');
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '120' } }))
      .mockImplementation(() => Promise.resolve(new Response(new Blob(['PNG']), { headers: { 'Content-Type': 'image/png' } })));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    // A prefetch may suppress the error, but cannot suppress the provider cooldown.
    await new Images().get('https://example.test/next', signal).catch(() => {});
    await vi.advanceTimersByTimeAsync(1400);
    await expect(new Images().get('https://example.test/next', signal)).rejects.toMatchObject({ retryAfter: 118600 });
    await expect(fetchRadarManifest(region, 'intensity', signal)).rejects.toMatchObject({ retryAfter: 118600 });
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(118600);
    await expect(new Images().get('https://example.test/next', signal)).resolves.toMatchObject({ type: 'image/png' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
it('keeps a bounded compressed-image cache and rejects XML service exceptions', async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(new Blob(['PNG']), { headers: { 'Content-Type': 'image/png' } })));
  vi.stubGlobal('fetch', fetch);
  const cache = new RadarImageCache(100, 2), signal = new AbortController().signal;
  await cache.get('https://example.test/1', signal); await cache.get('https://example.test/2', signal);
  await cache.get('https://example.test/1', signal);
  expect(fetch).toHaveBeenCalledTimes(2);
  await cache.get('https://example.test/3', signal); await cache.get('https://example.test/2', signal);
  expect(fetch).toHaveBeenCalledTimes(4);
  fetch.mockResolvedValueOnce(new Response('<ServiceException/>', { headers: { 'Content-Type': 'text/xml' } }));
  await expect(cache.get('https://example.test/bad', signal)).rejects.toThrow('no imagery');
  cache.clear(); await cache.get('https://example.test/2', signal); expect(fetch).toHaveBeenCalledTimes(6);
});
