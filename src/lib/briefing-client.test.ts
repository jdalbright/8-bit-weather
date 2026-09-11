import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acquireBriefing, briefingEndpoint, cachedBriefing, clearBriefingCache } from './briefing-client';
import { BRIEFING_PATH, BRIEFING_STORAGE, BRIEFING_TTL, BRIEFING_VERSION, briefingForecast } from './briefing';
import { readStoredValue, flushNativeStorage } from './persistence';
import { normalizeWeather } from './weather';
import { asheville, fixtureTime, forecastFixture } from '../test/fixtures';

beforeEach(() => {
  vi.stubEnv('VITE_NATIVE', 'false');
  vi.stubEnv('VITE_NATIVE_BRIEFING_URL', '');
  vi.useFakeTimers(); vi.setSystemTime(fixtureTime);
  clearBriefingCache();
});
afterEach(() => { clearBriefingCache(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('preserves the same-origin endpoint in web builds regardless of native config', () => {
  vi.stubEnv('VITE_NATIVE_BRIEFING_URL', 'https://native.example/api/weather-briefing');
  expect(briefingEndpoint()).toBe(BRIEFING_PATH);
});
it.each(['', '/api/weather-briefing', 'http://localhost/api/weather-briefing', 'https://secret@weather.example/api/weather-briefing', 'https://weather.example/api/weather-briefing.ts', 'https://weather.example/api/weather-briefing?key=secret', 'https://weather.example/api/weather-briefing#fragment'])('rejects unsafe or missing native endpoint %s', configured => {
  vi.stubEnv('VITE_NATIVE', 'true'); vi.stubEnv('VITE_NATIVE_BRIEFING_URL', configured);
  expect(briefingEndpoint).toThrowError('The briefing is unavailable');
});
it('sends native weather to its HTTPS endpoint with no cookies or redirect and honors cooldowns', async () => {
  vi.stubEnv('VITE_NATIVE', 'true');
  vi.stubEnv('VITE_NATIVE_BRIEFING_URL', 'https://weather.example/api/weather-briefing');
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
  vi.stubGlobal('fetch', fetcher);
  const forecast = briefingForecast(normalizeWeather(forecastFixture(), asheville, fixtureTime), 'imperial', fixtureTime);
  const job = acquireBriefing('native-key', 'native-scope', forecast);
  await expect(job.promise).rejects.toMatchObject({ code: 'rate_limited', retryAt: fixtureTime + 120000 });
  expect(fetcher).toHaveBeenCalledWith('https://weather.example/api/weather-briefing', expect.objectContaining({ method: 'POST', credentials: 'omit', redirect: 'error', body: JSON.stringify(forecast) }));
  job.release();
  await expect(acquireBriefing('other-key', 'native-scope', forecast).promise).rejects.toMatchObject({ code: 'rate_limited' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('returns a recoverable native configuration error without issuing a request', async () => {
  vi.stubEnv('VITE_NATIVE', 'true');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const forecast = briefingForecast(normalizeWeather(forecastFixture(), asheville, fixtureTime), 'imperial', fixtureTime);
  await expect(acquireBriefing('native-key', 'native-scope', forecast).promise).rejects.toMatchObject({ code: 'unconfigured' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('accepts a valid native response and keeps the briefing cache available', async () => {
  vi.stubEnv('VITE_NATIVE', 'true'); vi.stubEnv('VITE_NATIVE_BRIEFING_URL', 'https://weather.example/api/weather-briefing');
  const answer = { provider: 'openai', text: 'Mild today. Bring a light layer tonight.', generatedAt: fixtureTime, windowStart: fixtureTime, windowEnd: fixtureTime + 86400000, expiresAt: fixtureTime + BRIEFING_TTL, version: BRIEFING_VERSION };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(answer)));
  const forecast = briefingForecast(normalizeWeather(forecastFixture(), asheville, fixtureTime), 'imperial', fixtureTime);
  await expect(acquireBriefing('native-key', 'native-scope', forecast).promise).resolves.toEqual(answer);
  await flushNativeStorage();
  expect(JSON.parse(readStoredValue(BRIEFING_STORAGE)!)).toEqual([{ key: 'native-key', scope: 'native-scope', briefing: answer }]);
  expect(cachedBriefing('expired-key', 'native-scope', fixtureTime + 2 * 3600000, true)).toEqual(answer);
  expect(cachedBriefing('expired-key', 'other-place', fixtureTime + 2 * 3600000, true)).toBeNull();
  expect(cachedBriefing('expired-key', 'native-scope', fixtureTime + 86400000, true)).toBeNull();
});
