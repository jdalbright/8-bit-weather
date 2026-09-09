import { describe, expect, it, vi } from 'vitest';
import { fetchWeather, locate, searchPlaces, WeatherRequestError } from './api';
import { asheville, forecastFixture } from '../test/fixtures';
describe('keyless service access and location', () => {
  it('uses the public forecast API and normalizes real response fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(forecastFixture()))); vi.stubGlobal('fetch', fetcher);
    const result = await fetchWeather(asheville, new AbortController().signal);
    const url = new URL(fetcher.mock.calls[0][0]); expect(url.hostname).toBe('api.open-meteo.com'); expect(url.searchParams.has('apikey')).toBe(false); expect(result.hourly).toHaveLength(48); expect(result.daily).toHaveLength(7);
    expect(url.searchParams.get('minutely_15')).toBe('rain,showers');
    expect(url.searchParams.get('forecast_minutely_15')).toBe('16');
    expect(url.searchParams.get('precipitation_unit')).toBe('mm');
    expect(result.minutely).toHaveLength(16);
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
