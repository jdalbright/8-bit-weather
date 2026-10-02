import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentPrecipitation, radarFrame, radarKind, reconcileCurrentPrecipitation, resetCurrentPrecipitation, RADAR_MAX_AGE } from './current-precipitation';
import original from '../docs/evidence/weather-live-2026-09-12/app-raleigh-earlier-zero.json';
import incident from '../docs/evidence/weather-fix-2026-09-13/incident-radar.json';

const now = Date.parse('2026-09-12T17:22:05Z');
const time = now - 5000;
const xml = (times: number[]) => `<WMS_Capabilities><Layer><Name>conus_pcpn_typ</Name><Dimension name="time">${times.map(t => new Date(t).toISOString()).join(',')}</Dimension></Layer></WMS_Capabilities>`;
const pixel = (rgb = [4, 80, 164], alpha = 255) => ({ type: 'FeatureCollection', features: [{ properties: { RED_BAND: rgb[0], GREEN_BAND: rgb[1], BLUE_BAND: rgb[2], ALPHA_BAND: alpha } }] });
beforeEach(() => { resetCurrentPrecipitation(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('NOAA current precipitation', () => {
  it('uses only a recent advertised past frame of the precipitation-type product', () => {
    expect(radarFrame(xml([now-RADAR_MAX_AGE, time, now+60000]), now)).toBe(time);
    expect(radarFrame(xml([now-RADAR_MAX_AGE, now+60000]), now)).toBeNull();
    expect(radarFrame(xml([time]).replace('conus_pcpn_typ', 'conus_bref_qcd'), now)).toBeNull();
  });
  it.each([
    [[4,80,164], 'rain'], [[110,255,255], 'rain'], [[255,50,50], 'rain'],
    [[0,249,0], 'rain'], [[0,151,0], 'rain'], [[200,200,200], 'snow'], [[150,0,150], 'hail'],
  ] as const)('recognizes the official categorical palette %s', (rgb, expected) => {
    expect(radarKind(pixel([...rgb]))).toBe(expected);
  });
  it('never treats transparency, reflectivity colors, malformed responses, or blended pixels as a precipitation type', () => {
    for (const input of [null, {}, pixel([0,0,0],0), pixel([4,80,164],128), pixel([255,182,0]), pixel([3,80,164]), pixel([NaN,80,164]), {features: []}]) {
      expect(radarKind(input)).toBeNull();
    }
  });
  it('corrects the captured all-dry Raleigh response using independent local rain evidence without fabricating 100% or changing temperatures', () => {
    expect(incident.correctionInput.time).toBe(original.current.time);
    expect(incident.correctionInput.kind).toBe('rain');
    const result = reconcileCurrentPrecipitation(original.current, {kind:'rain',time:incident.correctionInput.time}, now);
    expect(result).toMatchObject({code:63,conditionLabel:'Rain on radar',precipitationProbability:null,precipitationRate:null,
      time:original.current.time,temperature:original.current.temperature,humidity:original.current.humidity});
    expect(original.current).toMatchObject({code:3,precipitationProbability:0,precipitationRate:0});
  });
  it.each([61, 65, 66, 71, 95, 96, 100, 101, 102])('retains explicit precipitation and storm code %s', code => {
    const current = {...original.current,code};
    expect(reconcileCurrentPrecipitation(current,{kind:'rain',time:time/1000},now)).toBe(current);
  });
  it.each([null, {kind:'rain' as const,time:(now-RADAR_MAX_AGE)/1000}, {kind:'rain' as const,time:now/1000+1}])('does not replace conditions with absent, stale, or future evidence: %s', radar => {
    expect(reconcileCurrentPrecipitation(original.current,radar,now)).toBe(original.current);
  });
  it('samples the exact coordinate and explicit frame, shares metadata, and never sends Xweather credentials to NOAA', async () => {
    const fetcher = vi.fn(async (input: string) => new URL(input).searchParams.get('request') === 'GetCapabilities' ? new Response(xml([time])) : Response.json(pixel()));
    vi.stubGlobal('fetch',fetcher);
    const [a,b] = await Promise.all([fetchCurrentPrecipitation(35.7796,-78.6382),fetchCurrentPrecipitation(35.8923,-78.782)]);
    expect(a).toEqual({time:time/1000,kind:'rain'}); expect(b).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const query = new URL(fetcher.mock.calls[1][0]);
    expect(query.hostname).toBe('opengeo.ncep.noaa.gov');
    expect(query.searchParams.get('time')).toBe(new Date(time).toISOString());
    const bounds = query.searchParams.get('bbox')!.split(',').map(Number);
    expect((bounds[0]+bounds[2])/2).toBeCloseTo(-78.6382,8);
    expect((bounds[1]+bounds[3])/2).toBeCloseTo(35.7796,8);
    expect(query.searchParams.get('x')).toBe('50'); expect(query.searchParams.get('y')).toBe('50');
    expect(query.searchParams.has('client_secret')).toBe(false);
  });
  it('makes no requests outside coverage and degrades gracefully for missing coverage', async () => {
    const fetcher = vi.fn(async () => new Response(xml([time]))); vi.stubGlobal('fetch',fetcher);
    expect(await fetchCurrentPrecipitation(35.7,139.7)).toBeNull();expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(new Response(xml([time]))).mockResolvedValueOnce(Response.json(pixel([0,0,0],0)));
    expect(await fetchCurrentPrecipitation(35.7796,-78.6382)).toBeNull();
  });
  it('honors NOAA backoff independently and recovers after its deadline', async () => {
    const fetcher = vi.fn(async () => new Response('',{status:429,headers:{'Retry-After':'120'}}));vi.stubGlobal('fetch',fetcher);
    expect(await fetchCurrentPrecipitation(35.7796,-78.6382)).toBeNull();
    expect(await fetchCurrentPrecipitation(35.7796,-78.6382)).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now+120000);await fetchCurrentPrecipitation(35.7796,-78.6382);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects a classification that becomes stale while its response is in flight', async () => {
    vi.stubGlobal('fetch',vi.fn(async (input: string) => {
      if (new URL(input).searchParams.get('request') === 'GetCapabilities') return new Response(xml([time]));
      vi.setSystemTime(time+RADAR_MAX_AGE);return Response.json(pixel());
    }));
    expect(await fetchCurrentPrecipitation(35.7796,-78.6382)).toBeNull();
  });
});
