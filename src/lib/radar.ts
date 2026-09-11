import type { Place } from '../types';

export type RadarLayer = 'intensity' | 'type';
export type RadarBounds = [west: number, south: number, east: number, north: number];
export interface RadarFrame { time: number }
export interface RadarRegion { id: string; label: string; bounds: RadarBounds }
export interface RadarManifest {
  region: RadarRegion; layer: RadarLayer; frames: RadarFrame[]; bounds: RadarBounds; fetchedAt: number;
}
export const RADAR_REFRESH = 120_000;
export const RADAR_DELAYED = 600_000;
export const radarRegions: RadarRegion[] = [
  { id: 'conus', label: 'Contiguous U.S.', bounds: [-130, 20, -60, 55] },
  { id: 'alaska', label: 'Alaska', bounds: [-180, 49, -125, 72] },
  { id: 'hawaii', label: 'Hawaii', bounds: [-164, 15, -151, 26] },
  { id: 'carib', label: 'Puerto Rico & Caribbean', bounds: [-90, 10, -60, 25] },
  { id: 'guam', label: 'Guam', bounds: [140, 9, 150, 18] },
];
export function regionForPlace(place: Pick<Place, 'latitude' | 'longitude'> | null): RadarRegion | null {
  if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return null;
  return radarRegions.find(({ bounds: [w, s, e, n] }) => place.longitude >= w && place.longitude <= e && place.latitude >= s && place.latitude <= n) ?? null;
}
export function radarProduct(region: RadarRegion, layer: RadarLayer): string {
  return `${region.id}_${layer === 'intensity' ? 'bref_qcd' : 'pcpn_typ'}`;
}
export function radarEndpoint(region: RadarRegion, layer: RadarLayer): string {
  return `https://opengeo.ncep.noaa.gov/geoserver/${region.id}/${radarProduct(region, layer)}/ows`;
}
export function sampleFrames(times: number[], now = Date.now()): RadarFrame[] {
  const valid = [...new Set(times.filter(time => Number.isFinite(time) && time > 0 && time <= now + 120_000))].sort((a, b) => a - b);
  const newest = valid.at(-1);
  if (newest === undefined) return [];
  const recent = valid.filter(time => time >= newest - 7_200_000);
  const count = Math.min(25, recent.length);
  return Array.from({ length: count }, (_, index) => ({ time: recent[count === 1 ? 0 : Math.round(index * (recent.length - 1) / (count - 1))] }));
}
function parseTimes(text: string): number[] {
  return text.split(',').flatMap(value => {
    const parts = value.trim().split('/');
    if (parts.length === 1) return [Date.parse(parts[0])];
    const duration = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(parts[2] ?? '');
    if (!duration) return [];
    const step = (Number(duration[1] ?? 0) * 3600 + Number(duration[2] ?? 0) * 60 + Number(duration[3] ?? 0)) * 1000;
    const start = Date.parse(parts[0]), end = Date.parse(parts[1]);
    if (!(step > 0) || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    // Expand only a bounded tail even if the server advertises a long archive.
    const count = Math.min(720, Math.floor((end - start) / step) + 1);
    const last = start + Math.floor((end - start) / step) * step;
    return Array.from({ length: count }, (_, i) => last - (count - i - 1) * step);
  });
}
export function parseRadarCapabilities(xml: string, region: RadarRegion, layer: RadarLayer, now = Date.now()): RadarManifest {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const child = (element: Element, name: string) => [...element.children].find(node => node.localName === name);
  const named = [...document.getElementsByTagNameNS('*', 'Layer')].find(element => child(element, 'Name')?.textContent?.split(':').at(-1) === radarProduct(region, layer));
  if (document.getElementsByTagName('parsererror').length || !named) throw new Error('Radar information is unavailable. Try again shortly.');
  const dimension = [...named.children].find(node => ['Dimension', 'Extent'].includes(node.localName) && node.getAttribute('name') === 'time');
  const frames = sampleFrames(parseTimes(dimension?.textContent ?? ''), now);
  if (!frames.length) throw new Error('No radar observations are available for this layer.');
  const geo = child(named, 'EX_GeographicBoundingBox');
  const values = geo ? ['westBoundLongitude', 'southBoundLatitude', 'eastBoundLongitude', 'northBoundLatitude'].map(key => Number(child(geo, key)?.textContent ?? NaN)) : [];
  const bounds: RadarBounds = values.length === 4 && values.every(Number.isFinite) && values[0] < values[2] && values[1] < values[3] ? values as RadarBounds : region.bounds;
  return { region, layer, frames, bounds, fetchedAt: now };
}
export class RadarRequestError extends Error {
  constructor(message: string, readonly retryAfter = 0) { super(message); }
}
// Shared by metadata, displayed imagery and prefetches; survives view remounts.
let providerRetryAt = 0;
export async function fetchRadarResource(url: string, signal: AbortSignal): Promise<Response> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const remaining = providerRetryAt - Date.now();
  if (remaining > 0) throw new RadarRequestError('Radar is busy. Please try again shortly.', remaining);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = window.setTimeout(abort, 12_000);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
    if (!response.ok) {
      const retry = response.headers.get('Retry-After');
      const delay = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
      const retryAfter = response.status === 429 ? Math.max(60_000, delay || 0) : 0;
      if (retryAfter) providerRetryAt = Math.max(providerRetryAt, Date.now() + retryAfter);
      throw new RadarRequestError(response.status === 429 ? 'Radar is busy. Please try again shortly.' : 'Radar imagery is unavailable. Please try again.', retryAfter);
    }
    // Consume the body within the timeout/abort lifetime, not just its headers.
    return new Response(await response.blob(), { status: response.status, headers: response.headers });
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof RadarRequestError) throw error;
    throw new RadarRequestError('Couldn’t reach the radar service. Check your connection and try again.');
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
}
export async function fetchRadarManifest(region: RadarRegion, layer: RadarLayer, signal: AbortSignal): Promise<RadarManifest> {
  const response = await fetchRadarResource(`${radarEndpoint(region, layer)}?service=WMS&version=1.3.0&request=GetCapabilities`, signal);
  return parseRadarCapabilities(await response.text(), region, layer);
}
export function intersectsRadar(a: RadarBounds, b: RadarBounds): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}
export function radarImageUrl(manifest: RadarManifest, frame: RadarFrame, bounds: RadarBounds, width: number, height: number): string {
  const mercatorY = (latitude: number) => 6378137 * Math.log(Math.tan(Math.PI / 4 + Math.max(-85.051129, Math.min(85.051129, latitude)) * Math.PI / 360));
  const x = (longitude: number) => longitude * Math.PI / 180 * 6378137;
  const bbox = [x(bounds[0]), mercatorY(bounds[1]), x(bounds[2]), mercatorY(bounds[3])].join(',');
  const params = new URLSearchParams({ service: 'WMS', version: '1.1.1', request: 'GetMap', layers: radarProduct(manifest.region, manifest.layer), styles: manifest.layer === 'intensity' ? 'radar_reflectivity' : 'radar_precip_type', format: 'image/png', transparent: 'true', srs: 'EPSG:3857', bbox, width: String(Math.max(1, Math.min(1024, Math.round(width)))), height: String(Math.max(1, Math.min(1024, Math.round(height)))), time: new Date(frame.time).toISOString() });
  return `${radarEndpoint(manifest.region, manifest.layer)}?${params}`;
}
