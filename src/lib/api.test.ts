import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearWeatherParts, fetchWeather, locate, searchPlaces, WeatherRequestError } from './api';
import { apiFixture, asheville, forecastFixture } from '../test/fixtures';
describe('keyless service access and location', () => {
  beforeEach(() => clearWeatherParts());
  it('uses normalized server sections without exposing credentials', async () => {
    const fetcher = vi.fn(async (url: string) => Response.json(apiFixture(forecastFixture(Date.now()), new URL(url, 'https://example.com').href)));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchWeather(asheville, new AbortController().signal);
    expect(result.provider).toBe('xweather'); expect(result.daily).toHaveLength(7); expect(result.hourly).toHaveLength(48);
    expect(result.minutely).toHaveLength(60);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.every(([url]) => url.startsWith('/api/weather?') && !url.includes('secret'))).toBe(true);
    await fetchWeather(asheville, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('rejects rate limits with the provider’s requested cooldown', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }))); await expect(fetchWeather(asheville, new AbortController().signal)).rejects.toMatchObject({ name: 'WeatherRequestError', retryAfterMs: 120000 }); });
  it('does not turn canceled searches into user-facing errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); })));
    const controller = new AbortController(); const promise = searchPlaces('Asheville', controller.signal); controller.abort(); await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('returns actionable timeout errors instead of hanging forever', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))));
    const promise = fetchWeather(asheville, new AbortController().signal); const check = expect(promise).rejects.toBeInstanceOf(WeatherRequestError);
    await vi.advanceTimersByTimeAsync(12001); await check;
  });
  it('handles location denial and rounds successful coordinates for forecast use', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_success: unknown, failure: (error: {code:number}) => void) => failure({code:1}) } });
    await expect(locate()).rejects.toThrow('permission');
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (success: (position: {coords:{latitude:number;longitude:number}}) => void) => success({coords:{latitude:35.59512345,longitude:-82.55154321}}) } });
    await expect(locate()).resolves.toMatchObject({name:'Current location',latitude:35.595,longitude:-82.552,source:'gps'});
  });
});
