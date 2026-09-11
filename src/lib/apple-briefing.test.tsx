import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { appleBriefingFacts, validAppleSummary } from './apple-briefing';
import { readStoredValue, writeStoredValue } from './persistence';
import { acquireBriefing, cachedBriefing, clearBriefingCache } from './briefing-client';
import { BRIEFING_STORAGE, BRIEFING_TTL, BRIEFING_VERSION, briefingForecast, isWeatherBriefing } from './briefing';
import { useBriefing } from '../hooks/useBriefing';
import { normalizeWeather } from './weather';
import * as native from './native';
import { asheville, fixtureTime, forecastFixture } from '../test/fixtures';

const plugin = vi.hoisted(() => { vi.resetModules(); return { availability: vi.fn(), generate: vi.fn(), cancel: vi.fn() }; });
vi.mock('@capacitor/core', async importOriginal => {
  const original = await importOriginal<typeof import('@capacitor/core')>();
  return { ...original, registerPlugin: (name: string) => name === 'AppleBriefing' ? plugin : original.registerPlugin(name) };
});
const snapshot = () => normalizeWeather(forecastFixture(), asheville, fixtureTime);
const forecast = () => briefingForecast(snapshot(), 'imperial', fixtureTime);
const localText = 'Temperatures stay mild today. Bring a light layer tonight.';
const cloud = () => ({ text: 'Expect mild weather today. Keep a light layer handy.', generatedAt: Date.now(), windowStart: Date.now(),
  windowEnd: Date.now() + 86400000, expiresAt: Date.now() + BRIEFING_TTL, version: BRIEFING_VERSION });
const flush = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
const request = (key = 'key', online = true) => acquireBriefing(key, 'scope', forecast(), false, online);

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(fixtureTime); vi.stubEnv('VITE_NATIVE', 'true');
  vi.stubEnv('VITE_NATIVE_BRIEFING_URL', 'https://weather.example/api/weather-briefing');
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  plugin.availability.mockReset().mockResolvedValue({ available: true, modelOSMajor: 27 });
  plugin.generate.mockReset().mockResolvedValue({ text: localText });
  plugin.cancel.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(cloud())));
  clearBriefingCache();
});
afterEach(() => { clearBriefingCache(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('generates on Apple, labels and persists it, and reuses the cache', async () => {
  await expect(request().promise).resolves.toMatchObject({ text: localText, provider: 'apple', appleModelOSMajor: 27 });
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.parse(readStoredValue(BRIEFING_STORAGE)!)[0].briefing.provider).toBe('apple');
  expect(JSON.parse(readStoredValue(BRIEFING_STORAGE)!)[0].briefing.appleModelOSMajor).toBe(27);
  await request().promise;
  expect(plugin.generate).toHaveBeenCalledTimes(1);
  expect(plugin.generate.mock.calls[0][0].facts).not.toMatch(/latitude|longitude|Asheville|placeId/);
});

it.each(['requires_ios27', 'os_unsupported', 'device_unsupported', 'intelligence_disabled', 'model_not_ready', 'language_unsupported'])('falls back once when %s', async reason => {
  plugin.availability.mockResolvedValue({ available: false, reason });
  await expect(request().promise).resolves.toMatchObject({ provider: 'openai' });
  expect(plugin.generate).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([undefined, 26, 27.5, '27'])('never starts Apple inference with unsupported model OS metadata %s', async modelOSMajor => {
  plugin.availability.mockResolvedValue({ available: true, modelOSMajor });
  await expect(request().promise).resolves.toMatchObject({ provider: 'openai' });
  expect(plugin.generate).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
});

it('does not generate or contact OpenAI offline on iOS 26', async () => {
  plugin.availability.mockResolvedValue({ available: false, reason: 'requires_ios27' });
  await expect(request('key', false).promise).rejects.toMatchObject({ code: 'offline' });
  expect(plugin.generate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

it.each([undefined, 26])('replaces older Apple cache with model OS %s, including offline saved entries', async appleModelOSMajor => {
  writeStoredValue(BRIEFING_STORAGE, JSON.stringify([{ key: 'key', scope: 'scope', briefing: { ...cloud(), provider: 'apple', appleModelOSMajor } }]));
  expect(cachedBriefing('key', 'scope', fixtureTime, false)).toBeNull();
  expect(cachedBriefing('other-key', 'scope', fixtureTime, true)).toBeNull();
  await expect(request('key', false).promise).resolves.toMatchObject({ provider: 'apple', appleModelOSMajor: 27 });
  expect(plugin.generate).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
});

it.each(['GENERATION_FAILED', 'BUSY'])('falls back once on native %s', async code => {
  plugin.generate.mockRejectedValue({ code });
  await expect(request().promise).resolves.toMatchObject({ provider: 'openai' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(['One sentence.', 'A sentence. A second. A third. A fourth.', 'word '.repeat(76) + '. Done.'])('rejects invalid local prose before fallback: %s', async text => {
  plugin.generate.mockResolvedValue({ text });
  await expect(request().promise).resolves.toMatchObject({ provider: 'openai' });
});

it('times out Apple at 20 seconds, cancels it, and gives OpenAI its own 15 seconds', async () => {
  plugin.generate.mockReturnValue(new Promise(() => {}));
  vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
  const job = request(); const outcome = expect(job.promise).rejects.toMatchObject({ code: 'unavailable' });
  await vi.advanceTimersByTimeAsync(19999); expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(plugin.cancel).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15000); await outcome;
});

it('bounds a hanging availability check and never starts late local generation', async () => {
  let resolve!: (value: { available: boolean }) => void;
  plugin.availability.mockReturnValue(new Promise(done => { resolve = done; }));
  const job = request(); await vi.advanceTimersByTimeAsync(20000); await job.promise;
  resolve({ available: true }); await flush();
  expect(plugin.generate).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(['release', 'clear'])('cancels without fallback or late cache writes on %s', async action => {
  let resolve!: (value: { text: string }) => void;
  plugin.generate.mockReturnValue(new Promise(done => { resolve = done; }));
  const job = request(); const outcome = expect(job.promise).rejects.toBeDefined(); await flush();
  if (action === 'release') job.release(); else clearBriefingCache();
  await flush(); await outcome; resolve({ text: localText }); await flush();
  expect(plugin.cancel).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  expect(readStoredValue(BRIEFING_STORAGE)).toBeNull();
});

it('treats native background cancellation as cancellation rather than cloud failure', async () => {
  plugin.generate.mockRejectedValue({ code: 'CANCELLED' });
  await expect(request().promise).rejects.toBeDefined(); expect(fetch).not.toHaveBeenCalled();
  plugin.generate.mockResolvedValue({ text: localText });
  await expect(request().promise).resolves.toMatchObject({ provider: 'apple' });
});

it('generates offline locally but never attempts offline cloud fallback', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await expect(request('local', false).promise).resolves.toMatchObject({ provider: 'apple' });
  clearBriefingCache(); plugin.availability.mockResolvedValue({ available: false });
  await expect(request('missing', false).promise).rejects.toMatchObject({ code: 'offline' });
  expect(fetch).not.toHaveBeenCalled();
});

it('recovers from offline unavailability on reconnect and honors fallback rate limits', async () => {
  plugin.availability.mockResolvedValue({ available: false });
  await expect(request('key', false).promise).rejects.toMatchObject({ code: 'offline' });
  vi.mocked(fetch).mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
  await expect(request().promise).rejects.toMatchObject({ code: 'rate_limited', retryAt: fixtureTime + 120000 });
  await expect(request('other').promise).rejects.toMatchObject({ code: 'rate_limited' });
  expect(fetch).toHaveBeenCalledTimes(1);
  plugin.availability.mockResolvedValue({ available: true, modelOSMajor: 27 });
  await expect(request('local').promise).resolves.toMatchObject({ provider: 'apple' });
});

it('rejects stale forecasts before either provider and again after a slow local attempt', async () => {
  await expect(acquireBriefing('stale', 's', { ...forecast(), fetchedAt: fixtureTime - 45 * 60000 }).promise).rejects.toBeDefined();
  expect(plugin.availability).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  plugin.generate.mockReturnValue(new Promise(() => {}));
  const job = acquireBriefing('aging', 's', { ...forecast(), fetchedAt: fixtureTime - 45 * 60000 + 10000 });
  const outcome = expect(job.promise).rejects.toMatchObject({ code: 'forecast_unavailable' });
  await vi.advanceTimersByTimeAsync(20000); await outcome; expect(fetch).not.toHaveBeenCalled();
});

it('keeps legacy cache entries compatible and rejects invented provider metadata', () => {
  expect(isWeatherBriefing(cloud())).toBe(true);
  expect(isWeatherBriefing({ ...cloud(), provider: 'apple' })).toBe(true);
  expect(isWeatherBriefing({ ...cloud(), provider: 'unknown' })).toBe(false);
  writeStoredValue(BRIEFING_STORAGE, JSON.stringify([{ key: 'key', scope: 'scope', briefing: cloud() }]));
  expect(cachedBriefing('key', 'scope', fixtureTime, false)?.text).toBe(cloud().text);
});

it('preserves interval probability, missing temperatures, units and midnight in compact facts', () => {
  const f = forecast(); f.hourly[0].temperature = null; f.hourly[0].precipitation = 99; f.hourly[1].precipitation = null;
  const facts = JSON.parse(appleBriefingFacts(f, fixtureTime));
  expect(facts.temperature.atStart).toBeNull(); expect(facts.precipitationChancePercent[0].value).toBeNull();
  expect(facts.temperature.missingHours).toBe(1); expect(facts.temperatureUnit).toBe('Fahrenheit');
  expect(facts.precipitationChancePercent[0].from).not.toBe(facts.precipitationChancePercent.at(-1).until);
  expect(JSON.parse(appleBriefingFacts({ ...f, units: 'metric' }, fixtureTime)).temperatureUnit).toBe('Celsius');
  expect(appleBriefingFacts(f, fixtureTime).length).toBeLessThan(5000);
});

it('deduplicates StrictMode and allows fresh offline generation through the hook', async () => {
  const hook = renderHook(() => useBriefing(snapshot(), 'imperial', false, fixtureTime), { wrapper: StrictMode });
  await flush(); expect(hook.result.current.briefing?.provider).toBe('apple');
  expect(plugin.generate).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
});

it('cancels on native background and resumes with a new request', async () => {
  let active = true; vi.spyOn(native, 'isAppActive').mockImplementation(() => active);
  plugin.generate.mockReturnValueOnce(new Promise(() => {}));
  const hook = renderHook(() => useBriefing(snapshot(), 'imperial', true, fixtureTime)); await flush();
  act(() => { active = false; window.dispatchEvent(new Event(native.NATIVE_ACTIVITY_EVENT)); }); await flush();
  expect(plugin.cancel).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  act(() => { active = true; window.dispatchEvent(new Event(native.NATIVE_ACTIVITY_EVENT)); }); await flush();
  expect(hook.result.current.briefing?.provider).toBe('apple');
});

it('discards late local results after changing location or units', async () => {
  let resolve!: (value: { text: string }) => void;
  plugin.generate.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const hook = renderHook(({ units }: { units: 'imperial' | 'metric' }) => useBriefing(snapshot(), units, true, fixtureTime), { initialProps: { units: 'imperial' } });
  await flush(); hook.rerender({ units: 'metric' }); await flush();
  expect(hook.result.current.briefing?.text).toBe(localText);
  resolve({ text: 'Old units. Old forecast.' }); await flush();
  expect(hook.result.current.briefing?.text).toBe(localText); expect(fetch).not.toHaveBeenCalled();
  expect(JSON.parse(readStoredValue(BRIEFING_STORAGE)!)).toHaveLength(1);
});

it('rejects invented explicit numeric probabilities and temperatures', () => {
  const f = forecast(); f.hourly.forEach(h => { h.precipitation = 0; h.temperature = 22.2; });
  expect(validAppleSummary('Temperatures stay around 72°. Expect a 10% chance of rain.', f, fixtureTime)).toBe(false);
  expect(validAppleSummary('Temperatures stay around 80 degrees. Expect dry weather.', f, fixtureTime)).toBe(false);
  expect(validAppleSummary('Temperatures stay around 72°. Expect dry weather with a 0 percent rain chance.', f, fixtureTime)).toBe(true);
});

it('rejects confident dry-weather prose when precipitation measurements are missing', () => {
  const f = forecast(); f.hourly.forEach(h => { h.precipitation = 0; h.temperature = 22.2; });
  f.hourly[1].precipitation = null;
  expect(validAppleSummary('Temperatures stay at 72°F. There is no chance of precipitation throughout the day.', f, fixtureTime)).toBe(false);
  expect(validAppleSummary('Available readings stay at 72°F. There is no chance of precipitation throughout the day.', f, fixtureTime)).toBe(false);
  expect(validAppleSummary('Available temperatures are around 72°F. Precipitation data is incomplete, so check the forecast before heading out.', f, fixtureTime)).toBe(true);
  f.hourly[0].temperature = null;
  expect(validAppleSummary('There are no available readings between 9 AM and 9 AM. Precipitation data is incomplete.', f, fixtureTime)).toBe(false);
});

it.each([true, false])('routes an overconfident missing-data answer safely with online=%s', async online => {
  const f = forecast(); f.hourly[1].precipitation = null;
  plugin.generate.mockResolvedValue({ text: 'Temperatures stay mild today. There is no chance of precipitation throughout the day.' });
  const job = acquireBriefing('missing-data', 'scope', f, false, online);
  if (online) {
    await expect(job.promise).resolves.toMatchObject({ provider: 'openai' });
    expect(fetch).toHaveBeenCalledTimes(1);
  } else {
    await expect(job.promise).rejects.toMatchObject({ code: 'offline' });
    expect(fetch).not.toHaveBeenCalled();
  }
});
