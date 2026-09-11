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
const request = (key = 'key', online = true) => acquireBriefing(key, 'scope', forecast(), false, online, 'apple');

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

it.each(['requires_ios27', 'os_unsupported', 'device_unsupported', 'intelligence_disabled', 'model_not_ready', 'language_unsupported'])('never falls back when Apple is %s', async reason => {
  plugin.availability.mockResolvedValue({ available: false, reason });
  await expect(request().promise).rejects.toMatchObject({ code: expect.stringMatching(/^apple:/) });
  expect(plugin.generate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

it.each([undefined, 26, 27.5, '27'])('never starts Apple inference with unsupported model OS metadata %s', async modelOSMajor => {
  plugin.availability.mockResolvedValue({ available: true, modelOSMajor });
  await expect(request().promise).rejects.toMatchObject({ code: expect.stringMatching(/^apple:/) });
  expect(plugin.generate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

it('does not generate or contact OpenAI offline on iOS 26', async () => {
  plugin.availability.mockResolvedValue({ available: false, reason: 'requires_ios27' });
  await expect(request('key', false).promise).rejects.toMatchObject({ code: expect.stringMatching(/^apple:/) });
  expect(plugin.generate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

it.each([undefined, 26])('replaces older Apple cache with model OS %s, including offline saved entries', async appleModelOSMajor => {
  writeStoredValue(BRIEFING_STORAGE, JSON.stringify([{ key: 'key', scope: 'scope', briefing: { ...cloud(), provider: 'apple', appleModelOSMajor } }]));
  expect(cachedBriefing('key', 'scope', fixtureTime, false)).toBeNull();
  expect(cachedBriefing('other-key', 'scope', fixtureTime, true)).toBeNull();
  await expect(request('key', false).promise).resolves.toMatchObject({ provider: 'apple', appleModelOSMajor: 27 });
  expect(plugin.generate).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
});

it.each(['GENERATION_FAILED', 'BUSY'])('never falls back on native %s', async code => {
  plugin.generate.mockRejectedValue({ code });
  await expect(request().promise).rejects.toMatchObject({ code: expect.stringMatching(/^apple:/) });
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['One sentence.', 'A sentence. A second. A third. A fourth.', 'word '.repeat(76) + '. Done.'])('rejects invalid local prose without fallback: %s', async text => {
  plugin.generate.mockResolvedValue({ text });
  await expect(request().promise).rejects.toMatchObject({ code: expect.stringMatching(/^apple:/) });
});

it('times out Apple at 20 seconds and cancels without contacting OpenAI', async () => {
  plugin.generate.mockReturnValue(new Promise(() => {}));
  const job = request(); const outcome = expect(job.promise).rejects.toMatchObject({ code: 'apple:apple_timeout' });
  await vi.advanceTimersByTimeAsync(20000); await outcome;
  expect(plugin.cancel).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
});

it('bounds hanging availability and never starts late generation', async () => {
  let resolve!: (value: { available: boolean }) => void;
  plugin.availability.mockReturnValue(new Promise(done => { resolve = done; }));
  const job = request(); const outcome = expect(job.promise).rejects.toBeDefined();
  await vi.advanceTimersByTimeAsync(20000); await outcome;
  resolve({ available: true }); await flush();
  expect(plugin.generate).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
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
  await expect(request('missing', false).promise).rejects.toMatchObject({ code: expect.stringMatching(/^apple:/) });
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps OpenAI rate limits separate from Apple generation', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
  await expect(acquireBriefing('key', 'scope', forecast()).promise).rejects.toMatchObject({ code: 'rate_limited' });
  await expect(acquireBriefing('other', 'scope', forecast()).promise).rejects.toMatchObject({ code: 'rate_limited' });
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(request().promise).resolves.toMatchObject({ provider: 'apple' });
});

it.each(['apple', 'openai'] as const)('rejects stale forecasts before %s', async provider => {
  await expect(acquireBriefing('stale', 's', { ...forecast(), fetchedAt: fixtureTime - 45 * 60000 }, false, true, provider).promise).rejects.toMatchObject({ code: 'forecast_unavailable' });
  expect(plugin.availability).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
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
  expect(facts.temperature.missingHours).toBe(1); expect(facts.missingPrecipitationHours).toBe(1);
  expect(facts.precipitation.peakChancePercent).not.toBe(99);
  expect(facts.temperature.missingHours).toBe(1); expect(facts.temperatureUnit).toBe('Fahrenheit');
  expect(facts.from).not.toBe(facts.until);
  expect(JSON.parse(appleBriefingFacts({ ...f, units: 'metric' }, fixtureTime)).temperatureUnit).toBe('Celsius');
  expect(appleBriefingFacts(f, fixtureTime).length).toBeLessThan(5000);
});

it('deduplicates StrictMode and allows fresh offline generation through the hook', async () => {
  const hook = renderHook(() => useBriefing(snapshot(), 'imperial', false, fixtureTime, 'apple'), { wrapper: StrictMode });
  await flush(); expect(hook.result.current.briefing?.provider).toBe('apple');
  expect(plugin.generate).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
});

it('cancels on native background and resumes with a new request', async () => {
  let active = true; vi.spyOn(native, 'isAppActive').mockImplementation(() => active);
  plugin.generate.mockReturnValueOnce(new Promise(() => {}));
  const hook = renderHook(() => useBriefing(snapshot(), 'imperial', true, fixtureTime, 'apple')); await flush();
  act(() => { active = false; window.dispatchEvent(new Event(native.NATIVE_ACTIVITY_EVENT)); }); await flush();
  expect(plugin.cancel).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
  act(() => { active = true; window.dispatchEvent(new Event(native.NATIVE_ACTIVITY_EVENT)); }); await flush();
  expect(hook.result.current.briefing?.provider).toBe('apple');
});

it('discards late local results after changing location or units', async () => {
  let resolve!: (value: { text: string }) => void;
  plugin.generate.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const hook = renderHook(({ units }: { units: 'imperial' | 'metric' }) => useBriefing(snapshot(), units, true, fixtureTime, 'apple'), { initialProps: { units: 'imperial' } });
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
  const job = acquireBriefing('missing-data', 'scope', f, false, online, 'apple');
  if (online) {
    await expect(job.promise).rejects.toMatchObject({ code: expect.stringMatching(/^apple:/) });
    expect(fetch).not.toHaveBeenCalled();
  } else {
    await expect(job.promise).rejects.toMatchObject({ code: expect.stringMatching(/^apple:/) });
    expect(fetch).not.toHaveBeenCalled();
  }
});


it('rejects invented missing-rain claims when coverage is complete', () => {
  const f = forecast(); f.hourly.forEach(h => { h.precipitation = 10; });
  expect(validAppleSummary('Temperatures stay mild today. Precipitation data is incomplete.', f, fixtureTime)).toBe(false);
  expect(validAppleSummary('Temperatures stay mild today. Rain chances stay low at 10%.', f, fixtureTime)).toBe(true);
});

it.each(['2026-03-08T05:00:00Z', '2026-11-01T04:00:00Z'])('keeps local dayparts and temperature peaks across DST at %s', date => {
  const now = Date.parse(date);
  const f = forecast(); f.timezone = 'America/New_York';
  f.hourly = Array.from({ length: 26 }, (_, i) => ({ ...f.hourly[0], time: now / 1000 + i * 3600, temperature: i === 8 ? 30 : i === 20 ? 10 : 20, precipitation: i === 9 ? 70 : 0 }));
  const facts = JSON.parse(appleBriefingFacts(f, now));
  expect(facts.temperature.high).toEqual({ value: '86°', period: 'this morning' });
  expect(facts.temperature.low).toEqual({ value: '50°', period: 'this evening' });
  expect(facts.precipitation.peakChancePercent).toBe(70);
  expect(facts.precipitation.peakPeriods).toEqual(['this morning']);
  expect(facts.coverage.precipitation).toMatch(/^complete/);
  expect(facts.missingPrecipitationHours).toBe(0);
});


it('gives steady weather one temperature instead of repeated high and low values', () => {
  const f = forecast(); f.hourly.forEach(h => { h.temperature = 22; h.precipitation = 0; });
  const facts = JSON.parse(appleBriefingFacts(f, fixtureTime));
  expect(facts.temperature.pattern).toBe('steady');
  expect(facts.temperature.steadyAt).toBe('72°');
  expect(facts.temperature.high).toBeUndefined();
  expect(facts.temperature.low).toBeUndefined();
  expect(facts.temperature.highDescription).toBe('mild');
  expect(facts.precipitation.peakChancePercent).toBe(0);
  expect(validAppleSummary('Expect temperatures near 72°F, then cooling overnight. Rain chances stay low.', f, fixtureTime)).toBe(false);
  expect(validAppleSummary('Expect temperatures to stay near 72°F. Rain chances stay low.', f, fixtureTime)).toBe(true);
});


it('defaults to OpenAI even when Apple is available, and ignores Apple selection on the web', async () => {
  await expect(acquireBriefing('default', 'scope', forecast()).promise).resolves.toMatchObject({ provider: 'openai' });
  expect(plugin.generate).not.toHaveBeenCalled();
  vi.stubEnv('VITE_NATIVE', 'false');
  await expect(acquireBriefing('web', 'scope', forecast(), false, true, 'apple').promise).resolves.toMatchObject({ provider: 'openai' });
  expect(plugin.generate).not.toHaveBeenCalled();
});

it('retains separate provider caches for the same forecast, including offline reads', async () => {
  await request().promise;
  expect(cachedBriefing('key', 'scope', fixtureTime, false, 'openai')).toBeNull();
  await acquireBriefing('key', 'scope', forecast()).promise;
  expect(cachedBriefing('key', 'scope', fixtureTime, true, 'apple')?.provider).toBe('apple');
  expect(cachedBriefing('key', 'scope', fixtureTime, true, 'openai')?.provider).toBe('openai');
  expect(JSON.parse(readStoredValue(BRIEFING_STORAGE)!)).toHaveLength(2);
});

it.each(['apple', 'openai'] as const)('cancels a pending %s request when switching providers and ignores its late response', async first => {
  let resolve!: (value: never) => void;
  if (first === 'apple') plugin.generate.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  else vi.mocked(fetch).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  const hook = renderHook(({ provider }: { provider: 'apple' | 'openai' }) => useBriefing(snapshot(), 'imperial', true, fixtureTime, provider), { initialProps: { provider: first } });
  await flush();
  const other = first === 'apple' ? 'openai' : 'apple';
  hook.rerender({ provider: other }); await flush();
  expect(hook.result.current.briefing?.provider).toBe(other);
  resolve((first === 'apple' ? { text: localText } : Response.json(cloud())) as never); await flush();
  expect(hook.result.current.briefing?.provider).toBe(other);
  expect(JSON.parse(readStoredValue(BRIEFING_STORAGE)!)).toHaveLength(1);
});

it('offers available Apple explicitly after an offline OpenAI miss without generating automatically', async () => {
  const hook = renderHook(() => useBriefing(snapshot(), 'imperial', false, fixtureTime, 'openai'));
  await flush();
  expect(hook.result.current.canSwitch).toBe(true);
  expect(hook.result.current.alternative).toBe('apple');
  expect(fetch).not.toHaveBeenCalled(); expect(plugin.generate).not.toHaveBeenCalled();
});
