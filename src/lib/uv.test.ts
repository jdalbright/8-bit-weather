import { describe, expect, it } from 'vitest';
import { uvForecast, uvInfo } from './uv';
import { normalizeWeather, STALE_AFTER } from './weather';
import { asheville, fixtureTime, uvFixture } from '../test/fixtures';

const snapshot = () => normalizeWeather(uvFixture(), asheville, fixtureTime);
describe('UV forecast interpretation', () => {
  it.each([[0,'Low'],[2,'Low'],[3,'Moderate'],[5,'Moderate'],[6,'High'],[7,'High'],[8,'Very high'],[10,'Very high'],[11,'Extreme'],[16,'Extreme']] as const)('labels UV %s as %s', (value, label) => {
    expect(uvInfo(value)?.level.label).toBe(label);
  });
  it('keeps rounding consistent with the displayed category and distinguishes zero from missing', () => {
    expect(uvInfo(5.5)).toMatchObject({index:6,level:{label:'High'}});
    expect(uvInfo(2.49)?.index).toBe(2);
    for (const value of [undefined,null,-1,NaN,Infinity]) expect(uvInfo(value)).toBeNull();
    expect(uvInfo(0)?.index).toBe(0);
  });
  it('shows the full day including a peak that occurred before opening the app', () => {
    const data = snapshot(), evening = data.daily[0].time + 18 * 3600;
    data.fetchedAt = evening * 1000; data.current.time = evening; data.current.uv = 0;
    const forecast = uvForecast(data, evening * 1000, true);
    expect(forecast.hours).toHaveLength(24);
    expect(forecast.peak?.index).toBe(7);
    expect(forecast.peakTime).toBe(data.daily[0].time + 13 * 3600);
  });
  it('finds when UV becomes low and stays low for the rest of the day', () => {
    const data = snapshot(), forecast = uvForecast(data, fixtureTime, true);
    expect(forecast.current?.index).toBe(4);
    expect(forecast.lowFrom).toBe(data.daily[0].time + 17 * 3600);
    data.hourly[11].uv = 1; // A brief cloudy interval before the peak isn't the afternoon drop.
    expect(uvForecast(data, fixtureTime, true).lowFrom).toBe(forecast.lowFrom);
  });
  it('keeps the daily maximum but omits peak timing and decline claims for incomplete curves', () => {
    const data = snapshot(); data.hourly = data.hourly.slice(10);
    const partial = uvForecast(data, fixtureTime, true);
    expect(partial.peak?.index).toBe(7); expect(partial.peakTime).toBeNull(); expect(partial.lowFrom).toBeNull();
    data.daily[0].uvMax = null;
    expect(uvForecast(data, fixtureTime, true).peak).toBeNull();
  });
  it('uses only a current-hour estimate once the current UV sample has aged or is missing', () => {
    const data = snapshot();
    expect(uvForecast(data, fixtureTime + 16 * 60000, true).current?.index).toBe(3);
    data.current.uv = null;
    expect(uvForecast(data, fixtureTime, true).current?.index).toBe(3);
    data.hourly[10].uv = null;
    expect(uvForecast(data, fixtureTime, true).current).toBeNull();
  });
  it('never presents offline, expired, or future-dated samples as current UV', () => {
    const data = snapshot();
    for (const [now, online] of [[fixtureTime,false],[fixtureTime+STALE_AFTER,true],[fixtureTime-1,true]] as const) {
      const forecast = uvForecast(data, now, online);
      expect(forecast.current).toBeNull(); expect(forecast.lowFrom).toBeNull(); expect(forecast.stale).toBe(true);
    }
  });
  it('handles old caches without UV and invalid provider values without inventing zeros', () => {
    const raw = uvFixture();
    const data = normalizeWeather({ ...raw, current:{...raw.current,uv_index:-1}, hourly:{...raw.hourly,uv_index:[null,'7',Infinity,-2]}, daily:{...raw.daily,uv_index_max:[null]} }, asheville, fixtureTime);
    expect(data.current.uv).toBeNull(); expect(data.hourly.every(h=>h.uv===null)).toBe(true); expect(data.daily[0].uvMax).toBeNull();
    const old = snapshot(); delete old.current.uv; old.hourly.forEach(h=>delete h.uv); old.daily.forEach(d=>delete d.uvMax);
    expect(uvForecast(old, fixtureTime, true).current).toBeNull();
    expect(uvForecast(old, fixtureTime, true).peak).toBeNull();
  });
  it('uses local dates across midnight and supports a 25-hour daylight-saving day', () => {
    const data = snapshot();
    const midnight = Date.parse('2026-11-01T04:00:00Z') / 1000;
    data.daily[0] = {...data.daily[0],date:'2026-11-01',time:midnight,uvMax:6};
    data.daily[1] = {...data.daily[1],date:'2026-11-02',time:midnight+25*3600};
    data.hourly = Array.from({length:25},(_,i)=>({...data.hourly[0],time:midnight+i*3600,uv:i===14?6:0}));
    data.fetchedAt = midnight*1000; data.current.time = midnight;
    const forecast = uvForecast(data,midnight*1000,true);
    expect(forecast.today).toBe('2026-11-01'); expect(forecast.hours).toHaveLength(25); expect(forecast.peakTime).toBe(midnight+14*3600);
    expect(uvForecast(data,(midnight-1)*1000,true).hours).toHaveLength(0);
  });
});
