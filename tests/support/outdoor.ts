import { outdoorWindows } from '../../src/lib/outdoor';
import { OUTDOOR_VERSION, type OutdoorRequest } from '../../src/lib/outdoor-ai';
import type { Page } from '@playwright/test';
import { apiFixture, fixtureTime } from '../../src/test/fixtures';
import { outdoorForecast } from '../../src/test/outdoor-fixtures';
import { BRIEFING_TTL, BRIEFING_VERSION } from '../../src/lib/briefing';

export async function mockOutdoor(page: Page) {
  const now = fixtureTime + 1800000;
  await page.clock.setFixedTime(now);
  const state = { forecast: outdoorForecast(), weatherRequests: 0, briefingRequests: 0, outdoorRequests: 0, outdoorFailure: false, outdoorGeneratedAt: now,
    outdoorText: 'Mild air and light wind make this a pleasant hour outside.', errors: [] as string[] };
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) state.errors.push(message.text()); });
  await page.route('**/api/weather?**', route => {
    state.weatherRequests++;
    return route.fulfill({ json: apiFixture(state.forecast, route.request().url()), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('**/api/weather-briefing', route => {
    const body = route.request().postDataJSON() as OutdoorRequest;
    if (body.kind === 'outdoor') {
      state.outdoorRequests++;
      if (state.outdoorFailure) return route.fulfill({ status: 503, json: { code: 'recommendation_unavailable' }, headers: { 'access-control-allow-origin': '*' } });
      const eligible = outdoorWindows(body.forecast, now, body.day, body.period);
      if (eligible.status !== 'recommended') throw new Error('No mock outdoor candidates');
      return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: {
        version: OUTDOOR_VERSION, start: (body.day === 'tomorrow' ? eligible.windows.find(hour => hour.start === Date.parse('2026-09-08T16:00Z') / 1000) : null)?.start ?? eligible.windows[0].start, text: state.outdoorText, generatedAt: state.outdoorGeneratedAt, expiresAt: state.outdoorGeneratedAt + 900000,
      } });
    }
    state.briefingRequests++;
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: {
      text: 'A mild forecast with a low precipitation chance today.', generatedAt: now, windowStart: now,
      windowEnd: now + 86400000, expiresAt: now + BRIEFING_TTL, version: BRIEFING_VERSION,
    } });
  });
  return state;
}
