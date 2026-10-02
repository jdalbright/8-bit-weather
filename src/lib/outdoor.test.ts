import { describe, expect, it } from 'vitest';
import { fixtureTime } from '../test/fixtures';
import { outdoorSnapshot } from '../test/outdoor-fixtures';
import { bestTimeOutside, type OutdoorDay, type OutdoorPeriod } from './outdoor';
import type { WeatherSnapshot } from '../types';

const now = fixtureTime + 1800000; // 10:30 AM in Asheville.
const choose = (snapshot: WeatherSnapshot = outdoorSnapshot(), day: OutdoorDay = 'today', period: OutdoorPeriod = 'any', at = now) => bestTimeOutside(snapshot, at, day, period);
const start = (snapshot = outdoorSnapshot(), day: OutdoorDay = 'today', period: OutdoorPeriod = 'any') => {
  const result = choose(snapshot, day, period);
  expect(result.status).toBe('recommended');
  return result.status === 'recommended' ? result.window.start : null;
};

describe('best time outside', () => {
  it('recommends a complete future hour without mutating the forecast', () => {
    const snapshot = outdoorSnapshot(), before = structuredClone(snapshot);
    expect(choose(snapshot)).toMatchObject({ status: 'recommended', window: { start: fixtureTime / 1000 + 3600, end: fixtureTime / 1000 + 7200, temperature: 22, precipitation: 10, wind: 8, uv: 3 } });
    expect(snapshot).toEqual(before);
  });
  it.each([{ code: 61 }, { code: 95 }, { code: 71 }, { code: 45 }, { temperature: 31 }, { temperature: 9 }, { wind: 21 }, { uv: 6 }, { precipitation: 31 }])('does not recommend an uncomfortable forecast: %j', change => {
    const snapshot = outdoorSnapshot();
    snapshot.hourly.forEach(hour => Object.assign(hour, change));
    expect(choose(snapshot)).toEqual({ status: 'no-comfortable-window' });
  });
  it.each(['temperature', 'wind', 'uv', 'precipitation', 'code'] as const)('treats missing %s as unavailable, never favorable', field => {
    const snapshot = outdoorSnapshot();
    snapshot.hourly.forEach(hour => { hour[field] = null; });
    expect(choose(snapshot)).toEqual({ status: 'unavailable' });
  });
  it.each([{ temperature: 10 }, { temperature: 30 }, { precipitation: 0 }, { precipitation: 30 }, { wind: 0 }, { wind: 20 }, { uv: 0 }, { uv: 5.9 }])('accepts the inclusive comfort boundaries and UV below six: %j', change => {
    const snapshot = outdoorSnapshot(); snapshot.hourly.forEach(hour => Object.assign(hour, change));
    expect(choose(snapshot).status).toBe('recommended');
  });
  it('aligns precipitation to the following timestamp and uses bands before temperature, wind, UV, and time', () => {
    const snapshot = outdoorSnapshot();
    snapshot.hourly.forEach(hour => { hour.precipitation = 80; });
    const a = snapshot.hourly[1], b = snapshot.hourly[3];
    snapshot.hourly[2].precipitation = 1; snapshot.hourly[4].precipitation = 9;
    a.temperature = 29; b.temperature = 22;
    expect(start(snapshot)).toBe(b.time);
    snapshot.hourly[4].precipitation = 10;
    expect(start(snapshot)).toBe(a.time);
    snapshot.hourly[4].precipitation = 9; a.temperature = 22; a.wind = 10;
    expect(start(snapshot)).toBe(b.time);
    a.wind = 8; a.uv = 4;
    expect(start(snapshot)).toBe(b.time);
    a.uv = 3;
    expect(start(snapshot)).toBe(a.time);
  });
  it('uses forecast freshness independently of current conditions and rejects absent or future timestamps', () => {
    const snapshot = outdoorSnapshot();
    snapshot.fetchedAt = now; snapshot.sectionTimes.current = now;
    snapshot.sectionTimes.forecast = now - 3600001;
    expect(choose(snapshot)).toEqual({ status: 'unavailable' });
    snapshot.sectionTimes.forecast = now - 3600000;
    expect(choose(snapshot).status).toBe('recommended');
    snapshot.sectionTimes.forecast = now + 1;
    expect(choose(snapshot).status).toBe('unavailable');
    expect(choose({ ...snapshot, sectionTimes: undefined } as WeatherSnapshot).status).toBe('unavailable');
  });
  it('filters by local day and complete morning, afternoon, and evening hours', () => {
    expect(start(outdoorSnapshot(), 'today', 'morning')).toBe(Date.parse('2026-09-07T15:00Z') / 1000);
    expect(start(outdoorSnapshot(), 'today', 'afternoon')).toBe(Date.parse('2026-09-07T16:00Z') / 1000);
    expect(start(outdoorSnapshot(), 'today', 'evening')).toBe(Date.parse('2026-09-07T21:00Z') / 1000);
    expect(start(outdoorSnapshot(), 'tomorrow', 'afternoon')).toBe(Date.parse('2026-09-08T16:00Z') / 1000);
  });
  it('requires the entire hour to fit between sunrise and sunset', () => {
    const snapshot = outdoorSnapshot();
    snapshot.daily[0].sunrise = Date.parse('2026-09-07T15:30Z') / 1000;
    snapshot.daily[0].sunset = Date.parse('2026-09-07T17:30Z') / 1000;
    expect(start(snapshot)).toBe(Date.parse('2026-09-07T16:00Z') / 1000);
    snapshot.daily[0].sunset = Date.parse('2026-09-07T16:30Z') / 1000;
    expect(choose(snapshot).status).toBe('no-daylight');
  });
  it.each([['2026-09-07T16:30Z', 'morning'], ['2026-09-07T23:30Z', 'any']] as const)('distinguishes an elapsed daylight period from missing weather: %s', (iso, period) => {
    const at = Date.parse(iso), snapshot = outdoorSnapshot();
    snapshot.sectionTimes.forecast = at;
    expect(choose(snapshot, 'today', period, at).status).toBe('no-daylight');
  });
  it.each([null, Number.NaN, 1e20, Date.parse('2026-09-08T11:00Z') / 1000])('rejects missing, invalid, or wrong-date solar boundaries: %s', sunrise => {
    const snapshot = outdoorSnapshot(); snapshot.daily[0].sunrise = sunrise;
    expect(choose(snapshot).status).toBe('unavailable');
  });
  it('does not invent recommendations from gaps or a missing trailing precipitation boundary', () => {
    const snapshot = outdoorSnapshot();
    snapshot.hourly = [snapshot.hourly[1]];
    expect(choose(snapshot).status).toBe('unavailable');
    snapshot.hourly = [];
    expect(choose(snapshot).status).toBe('unavailable');
  });
  it('ignores incomplete hours when a complete qualifying hour is available', () => {
    const snapshot = outdoorSnapshot(); snapshot.hourly[1].wind = undefined;
    expect(start(snapshot)).toBe(snapshot.hourly[2].time);
  });
  it.each([
    ['2026-03-08T04:30Z', 'America/New_York', '2026-03-08', '2026-03-08T11:00Z', '2026-03-08T23:00Z', '2026-03-08T16:00Z'],
    ['2026-11-01T03:30Z', 'America/New_York', '2026-11-01', '2026-11-01T12:00Z', '2026-11-01T22:00Z', '2026-11-01T17:00Z'],
    ['2026-12-31T14:30Z', 'Asia/Tokyo', '2027-01-01', '2026-12-31T22:00Z', '2027-01-01T08:00Z', '2027-01-01T03:00Z'],
  ])('uses calendar tomorrow across DST and year/timezone boundaries: %s', (iso, timezone, date, sunrise, sunset, expected) => {
    const at = Date.parse(iso), snapshot = outdoorSnapshot(at);
    snapshot.timezone = timezone;
    snapshot.daily = [{ ...snapshot.daily[0], date, sunrise: Date.parse(sunrise) / 1000, sunset: Date.parse(sunset) / 1000 }];
    expect(choose(snapshot, 'tomorrow', 'afternoon', at)).toMatchObject({ status: 'recommended', window: { start: Date.parse(expected) / 1000 } });
  });
  it('keeps fractional-offset hours entirely within the selected local period', () => {
    const at = Date.parse('2026-09-07T04:15Z'), snapshot = outdoorSnapshot(at);
    snapshot.timezone = 'Asia/Kolkata';
    snapshot.daily[0] = { ...snapshot.daily[0], sunrise: Date.parse('2026-09-07T01:30Z') / 1000, sunset: Date.parse('2026-09-07T13:30Z') / 1000 };
    expect(choose(snapshot, 'today', 'morning', at)).toMatchObject({ window: { start: Date.parse('2026-09-07T05:00Z') / 1000 } });
    snapshot.hourly.find(hour => hour.time === Date.parse('2026-09-07T05:00Z') / 1000)!.wind = 30;
    expect(choose(snapshot, 'today', 'morning', at).status).toBe('no-comfortable-window');
    expect(choose(snapshot, 'today', 'afternoon', at)).toMatchObject({ window: { start: Date.parse('2026-09-07T07:00Z') / 1000 } });
  });
});
