import { beforeEach, expect, it, vi } from 'vitest';
import { generateOutdoorRecommendation, OutdoorError } from './outdoor-client';
import { outdoorRequest, OUTDOOR_VERSION } from './outdoor-ai';
import { outdoorSnapshot } from '../test/outdoor-fixtures';
import { fixtureTime } from '../test/fixtures';

vi.mock('./briefing-client', () => ({ briefingEndpoint: () => '/api/weather-briefing', clearBriefingCache: vi.fn() }));
const now = fixtureTime + 1800000;
const request = () => outdoorRequest(outdoorSnapshot(), now, 'tomorrow', 'afternoon');
const answer = () => ({ version: OUTDOOR_VERSION, start: Date.parse('2026-09-08T16:00Z') / 1000, text: 'Mild air and light wind.', generatedAt: now, expiresAt: now + 900000 });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });

it('posts once to the configured briefing route and validates a future AI recommendation', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json(answer())); vi.stubGlobal('fetch', fetch);
  expect(await generateOutdoorRecommendation(request(), new AbortController().signal)).toEqual(answer());
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('/api/weather-briefing');
  expect(options).toMatchObject({ method: 'POST', cache: 'no-store', credentials: 'omit' });
  expect(options.body).not.toMatch(/latitude|longitude|placeId|Asheville/);
});

it.each(['wrong hour', 'stale', 'malformed', 'http failure'] as const)('does not substitute a recommendation or retry after %s', async scenario => {
  const response = answer();
  if (scenario === 'wrong hour') response.start -= 86400;
  if (scenario === 'stale') response.expiresAt = now - 1;
  const fetch = vi.fn().mockResolvedValue(scenario === 'malformed' ? new Response('not json') : Response.json(response, { status: scenario === 'http failure' ? 503 : 200 }));
  vi.stubGlobal('fetch', fetch);
  await expect(generateOutdoorRecommendation(request(), new AbortController().signal)).rejects.toBeInstanceOf(OutdoorError);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('aborts a pending request at the timeout and allows manual retry later', async () => {
  const fetch = vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  vi.stubGlobal('fetch', fetch);
  const pending = generateOutdoorRecommendation(request(), new AbortController().signal);
  const failed = expect(pending).rejects.toBeInstanceOf(OutdoorError);
  await vi.advanceTimersByTimeAsync(15000);
  await failed;
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('cancels obsolete filter work without turning cancellation into a retry error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  })));
  const controller = new AbortController();
  const pending = generateOutdoorRecommendation(request(), controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});

it('shares a provider cooldown across filter changes and respects Retry-After', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('busy', { status: 429, headers: { 'retry-after': '90' } }));
  vi.stubGlobal('fetch', fetch);
  await expect(generateOutdoorRecommendation(request(), new AbortController().signal)).rejects.toMatchObject({ retryAt: now + 90000 });
  const changed = request(); changed.period = 'evening';
  await expect(generateOutdoorRecommendation(changed, new AbortController().signal)).rejects.toBeInstanceOf(OutdoorError);
  expect(fetch).toHaveBeenCalledTimes(1);
  vi.setSystemTime(now + 90001);
  fetch.mockResolvedValue(Response.json({ ...answer(), generatedAt: now + 90001 }));
  await expect(generateOutdoorRecommendation(request(), new AbortController().signal)).resolves.toMatchObject({ start: answer().start });
  expect(fetch).toHaveBeenCalledTimes(2);
});
