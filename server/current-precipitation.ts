import type { CurrentWeather } from '../src/types';
import { RADAR_CONDITION_MAX_AGE, weatherInfo } from '../src/lib/weather.js';

export const RADAR_MAX_AGE = RADAR_CONDITION_MAX_AGE;
export const CURRENT_REFRESH = 2 * 60 * 1000;
type RadarKind = 'rain' | 'snow' | 'hail';
export type RadarPrecipitation = { time: number; kind: RadarKind };

// NOAA's PCPNTYP_CT legend: categorical surface-precipitation classifications,
// not the reflectivity color ramp. Unknown/blended colors never imply rain.
const types: Record<string, RadarKind> = {
  '4,80,164': 'rain', '110,255,255': 'rain', '255,50,50': 'rain',
  '0,249,0': 'rain', '0,151,0': 'rain', '200,200,200': 'snow', '150,0,150': 'hail',
};
const endpoint = 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_pcpn_typ/ows';
let manifest: { time: number; expires: number } | null = null;
let manifestRequest: Promise<number | null> | null = null;
let retryAt = 0;

export function resetCurrentPrecipitation() { manifest = null; manifestRequest = null; retryAt = 0; }

export function radarFrame(xml: string, now: number): number | null {
  // Scope the dimension to the requested layer; do not take a timestamp from
  // another product, the server's current clock, or a future/default frame.
  const layer = xml.match(/<Layer\b[^>]*>\s*<Name>conus_pcpn_typ<\/Name>([\s\S]*?)<\/Layer>/)?.[1];
  const dimension = layer?.match(/<Dimension\b[^>]*name="time"[^>]*>([^<]+)<\/Dimension>/)?.[1];
  const frames = (dimension ?? '').split(',').map(value => Date.parse(value.trim()))
    .filter(time => Number.isFinite(time) && time <= now && now - time < RADAR_MAX_AGE);
  return frames.length ? Math.max(...frames) : null;
}

export function radarKind(raw: unknown): RadarKind | null {
  const data = raw as { type?: unknown; features?: { properties?: Record<string, unknown> }[] } | null;
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length !== 1) return null;
  const p = data.features[0]?.properties;
  if (!p || p.ALPHA_BAND !== 255) return null;
  const rgb = [p.RED_BAND, p.GREEN_BAND, p.BLUE_BAND];
  if (!rgb.every(value => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255)) return null;
  return types[rgb.join(',')] ?? null;
}

async function request(params: Record<string, string>, signal: AbortSignal): Promise<Response> {
  const response = await fetch(`${endpoint}?${new URLSearchParams(params)}`, { signal, redirect: 'error' });
  if (!response.ok) {
    if (response.status === 429 || response.status === 503) {
      const header = response.headers.get('retry-after');
      const seconds = Number(header);
      const delay = header && Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : 60_000;
      retryAt = Math.max(retryAt, Date.now() + Math.max(60_000, Number.isFinite(delay) ? delay : 60_000));
    }
    throw new Error('radar_unavailable');
  }
  return response;
}

async function latestFrame(signal: AbortSignal): Promise<number | null> {
  if (manifest && Date.now() < manifest.expires && Date.now() - manifest.time < RADAR_MAX_AGE) return manifest.time;
  if (manifestRequest) return manifestRequest;
  const job = (async () => {
    const response = await request({ service: 'WMS', version: '1.3.0', request: 'GetCapabilities' }, signal);
    const time = radarFrame(await response.text(), Date.now());
    if (time !== null) manifest = { time, expires: Date.now() + 60_000 };
    return time;
  })();
  manifestRequest = job;
  try { return await job; } finally { if (manifestRequest === job) manifestRequest = null; }
}

/** Positive local evidence only. Missing/blank radar is not a dry observation.
 * This product is CONUS only. Never use a nearby pixel or a forecast minute.
 */
export async function fetchCurrentPrecipitation(latitude: number, longitude: number): Promise<RadarPrecipitation | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < 20 || latitude > 55 || longitude < -130 || longitude > -60 || Date.now() < retryAt) return null;
  const signal = AbortSignal.timeout(3500);
  try {
    const time = await latestFrame(signal);
    if (time === null || Date.now() < retryAt) return null;
    const response = await request({
      service: 'WMS', version: '1.1.1', request: 'GetFeatureInfo',
      layers: 'conus_pcpn_typ', query_layers: 'conus_pcpn_typ', styles: 'radar_precip_type',
      info_format: 'application/json', srs: 'EPSG:4326',
      bbox: [longitude - 0.01, latitude - 0.01, longitude + 0.01, latitude + 0.01].join(','),
      width: '101', height: '101', x: '50', y: '50', time: new Date(time).toISOString(),
    }, signal);
    const kind = radarKind(await response.json());
    return kind && Date.now() >= time && Date.now() - time < RADAR_MAX_AGE ? { time: time / 1000, kind } : null;
  } catch { return null; }
}

export function reconcileCurrentPrecipitation(current: CurrentWeather, radar: RadarPrecipitation | null, now = Date.now()): CurrentWeather {
  if (!radar || !['rain', 'snow', 'hail'].includes(radar.kind) || !Number.isFinite(radar.time)
    || radar.time * 1000 > now || now - radar.time * 1000 >= RADAR_MAX_AGE) return current;
  // Keep explicit precipitation, freezing conditions, and thunderstorm reports.
  // The radar estimate fills a dry/unknown condition; it cannot confirm lightning.
  const kind = weatherInfo(current.code).kind;
  if (['rain', 'snow', 'storm'].includes(kind)) return current;
  const code = { rain: 63, snow: 73, hail: 102 }[radar.kind];
  return { ...current, code, conditionLabel: `${radar.kind === 'rain' ? 'Rain' : radar.kind === 'snow' ? 'Snow' : 'Hail'} on radar`,
    precipitationProbability: null, precipitationRate: null,
    radarPrecipitation: radar };
}
