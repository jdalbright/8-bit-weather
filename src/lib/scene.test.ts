import { describe, expect, it } from 'vitest';
import { asheville, forecastFixture, fixtureTime } from '../test/fixtures';
import { normalizeWeather, STALE_AFTER } from './weather';
import { deriveScene, precipitationIntensity, sceneGeometry, welcomeScene } from './scene';

function at(iso: string) {
  const time = Date.parse(iso);
  const snapshot = normalizeWeather(forecastFixture(fixtureTime), asheville, time);
  snapshot.current.time = time / 1000;
  return { snapshot, time };
}
describe('the living meadow clock', () => {
  it.each([
    ['2026-09-07T10:29:59Z', 'night', 0],
    ['2026-09-07T10:30:00Z', 'dawn', 0],
    ['2026-09-07T11:00:00Z', 'dawn', .5],
    ['2026-09-07T11:30:00Z', 'day', 1],
    ['2026-09-07T22:30:00Z', 'dusk', 1],
    ['2026-09-07T23:00:00Z', 'dusk', .5],
    ['2026-09-07T23:30:00Z', 'night', 0],
  ])('uses the solar boundary at %s', (iso, phase, daylight) => {
    const { snapshot, time } = at(iso);
    expect(deriveScene(snapshot, time)).toMatchObject({ phase, daylight });
  });
  it('progresses through twilight continuously without a new fetch', () => {
    const { snapshot, time } = at('2026-09-07T22:45:00Z');
    expect(deriveScene(snapshot, time).transition).toBe(.25);
    expect(deriveScene(snapshot, time + 5 * 60000).transition).toBeCloseTo(1 / 3);
  });
  it('keeps saved weather at its actual observation time offline or after expiry', () => {
    const { snapshot, time } = at('2026-09-07T22:45:00Z');
    expect(deriveScene(snapshot, time + STALE_AFTER).phase).toBe('dusk');
    expect(deriveScene(snapshot, time + 86400000, false).transition).toBe(.25);
    expect(snapshot.version).toBe(1);
  });
  it.each(['sunrise', 'sunset'] as const)('uses the provider flag when %s is missing', key => {
    const { snapshot, time } = at('2026-09-07T11:00:00Z');
    snapshot.daily[0][key] = null; snapshot.current.isDay = false;
    expect(deriveScene(snapshot, time)).toMatchObject({ phase: 'night', daylight: 0 });
  });
  it('handles polar days, invalid order and short days without overlapping phases', () => {
    const { snapshot, time } = at('2026-09-07T11:00:00Z');
    for (const sunset of [snapshot.daily[0].sunrise! - 60, snapshot.daily[0].sunrise! + 1200, NaN]) {
      snapshot.daily[0].sunset = sunset;
      expect(deriveScene(snapshot, time)).toMatchObject({ phase:'day', daylight:1 });
    }
  });
  it('selects the location date across midnight and a DST offset change', () => {
    const { snapshot } = at('2026-09-07T11:00:00Z');
    const time = Date.parse('2026-11-01T11:30:00Z'); // 06:30 EST after the clocks change.
    snapshot.fetchedAt = time; snapshot.current.time = time / 1000;
    snapshot.daily = [{ ...snapshot.daily[0], date:'2026-11-01', time:Date.parse('2026-11-01T04:00Z')/1000,
      sunrise:Date.parse('2026-11-01T12:00Z')/1000, sunset:Date.parse('2026-11-01T22:00Z')/1000 }];
    expect(deriveScene(snapshot,time)).toMatchObject({ phase:'dawn', transition:0 });
    snapshot.timezone = 'Asia/Tokyo';
    snapshot.daily[0] = { ...snapshot.daily[0], date:'2026-11-02', sunrise:Date.parse('2026-11-01T21:00Z')/1000, sunset:Date.parse('2026-11-02T08:00Z')/1000 };
    const next = Date.parse('2026-11-01T21:00:00Z');
    snapshot.fetchedAt=next; snapshot.current.time=next/1000;
    expect(deriveScene(snapshot,next)).toMatchObject({ phase:'dawn', transition:.5 });
  });
  it('bounds wind, maps all precipitation families and leaves missing weather neutral', () => {
    expect(deriveScene(null, fixtureTime)).toEqual(welcomeScene);
    const { snapshot, time } = at('2026-09-07T14:00:00Z');
    snapshot.current.wind = 100;
    expect(deriveScene(snapshot,time).windStrength).toBe(1);
    snapshot.current.wind = null;
    expect(deriveScene(snapshot,time).windStrength).toBe(0);
    expect(precipitationIntensity(61)).toBeLessThan(precipitationIntensity(65));
    expect(precipitationIntensity(71)).toBeLessThan(precipitationIntensity(75));
    expect(precipitationIntensity(95)).toBeLessThan(precipitationIntensity(99));
    expect(precipitationIntensity(123)).toBe(0);
    expect(precipitationIntensity(null)).toBe(0);
  });
  it('uses a centered, bottom-aligned cover transform for both scene crops', () => {
    const regular = sceneGeometry(390,340);
    const welcome = sceneGeometry(320,465);
    expect(regular.left).toBeLessThan(0); expect(welcome.left).toBeLessThan(regular.left);
    expect(welcome.top + 801 * welcome.scale).toBe(465);
    expect(welcome.left + 960 * welcome.scale / 2).toBe(160);
  });
});
