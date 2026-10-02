import { expect, it } from 'vitest';
import { outdoorRequest, parseOutdoorRequest, validOutdoorRecommendation, OUTDOOR_VERSION } from './outdoor-ai';
import { outdoorWindows } from './outdoor';
import { outdoorSnapshot } from '../test/outdoor-fixtures';
import { fixtureTime } from '../test/fixtures';

const now = fixtureTime + 1800000;

it.each(['day', 'period'] as const)('rejects non-string %s values instead of coercing them or throwing', field => {
  const request = outdoorRequest(outdoorSnapshot(), now, 'today', 'any');
  for (const value of [[request[field]], { toString: null }, null, 1, true]) {
    expect(parseOutdoorRequest({ ...request, [field]: value })).toBeNull();
  }
});

it('keeps the same request across an hour boundary and sends only the selected daylight forecast', () => {
  const snapshot = outdoorSnapshot();
  snapshot.sectionTimes.forecast = fixtureTime + 50 * 60000;
  const before = outdoorRequest(snapshot, fixtureTime + 59 * 60000, 'tomorrow', 'any');
  const after = outdoorRequest(snapshot, fixtureTime + 61 * 60000, 'tomorrow', 'any');
  expect(after).toEqual(before);
  expect(after.forecast.daily).toHaveLength(1);
  expect(after.forecast.hourly.length).toBeLessThan(25);
  expect(parseOutdoorRequest(after)).toEqual(after);
  // Trimming must retain the following timestamp used to align precipitation.
  const full = outdoorWindows(snapshot, fixtureTime + 61 * 60000, 'tomorrow', 'any');
  expect(outdoorWindows(after.forecast, fixtureTime + 61 * 60000, 'tomorrow', 'any')).toEqual(full);
});

it('treats a missing forecast timestamp as invalid instead of throwing on a saved result', () => {
  const request = outdoorRequest(outdoorSnapshot(), now, 'today', 'any');
  request.forecast.sectionTimes = undefined;
  expect(validOutdoorRecommendation({ version: OUTDOOR_VERSION, generatedAt: now, expiresAt: now + 900000,
    start: Date.parse('2026-09-07T15:00Z') / 1000, text: 'Mild air and light wind.' }, request, now)).toBe(false);
});

it('rejects non-numeric response timestamps without invoking object coercion', () => {
  const request = outdoorRequest(outdoorSnapshot(), now, 'today', 'any');
  expect(validOutdoorRecommendation({ version: OUTDOOR_VERSION, generatedAt: now, expiresAt: now + 900000,
    start: { toString: null }, text: 'Mild air and light wind.' }, request, now)).toBe(false);
});

it.each([
  ['2026-03-08T04:30Z', 'America/New_York', '2026-03-08', '2026-03-08T11:00Z', '2026-03-08T23:00Z'],
  ['2026-11-01T03:30Z', 'America/New_York', '2026-11-01', '2026-11-01T12:00Z', '2026-11-01T22:00Z'],
  ['2026-12-31T14:30Z', 'Asia/Tokyo', '2027-01-01', '2026-12-31T22:00Z', '2027-01-01T08:00Z'],
])('preserves complete candidate coverage when trimming a timezone-boundary forecast: %s', (iso, timezone, date, sunrise, sunset) => {
  const at = Date.parse(iso), snapshot = outdoorSnapshot(at);
  snapshot.timezone = timezone;
  snapshot.daily = [{ ...snapshot.daily[0], date, sunrise: Date.parse(sunrise) / 1000, sunset: Date.parse(sunset) / 1000 }];
  const request = parseOutdoorRequest(outdoorRequest(snapshot, at, 'tomorrow', 'any'))!;
  expect(request).not.toBeNull();
  expect(outdoorWindows(request.forecast, at, 'tomorrow', 'any')).toEqual(outdoorWindows(snapshot, at, 'tomorrow', 'any'));
});

it('preserves a provider grid that starts on the half hour, including precipitation alignment', () => {
  const snapshot = outdoorSnapshot();
  snapshot.hourly.forEach(hour => { hour.time += 1800; });
  const request = outdoorRequest(snapshot, now, 'today', 'any');
  const result = outdoorWindows(request.forecast, now, 'today', 'any');
  expect(result).toEqual(outdoorWindows(snapshot, now, 'today', 'any'));
  expect(result).toMatchObject({ status: 'recommended', windows: expect.arrayContaining([
    expect.objectContaining({ start: Date.parse('2026-09-07T15:30Z') / 1000, end: Date.parse('2026-09-07T16:30Z') / 1000, precipitation: 10 }),
  ]) });
});
