import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { handleBriefing } from './briefing';
import { briefingForecast, isWeatherBriefing } from '../src/lib/briefing';
import { normalizeWeather } from '../src/lib/weather';
import { asheville, forecastFixture } from '../src/test/fixtures';

// Explicit opt-in only: normal CI and npm test never spend API tokens.
describe.skipIf(process.env.RUN_LIVE_BRIEFING !== 'true')('live OpenAI briefing samples', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([['dry', 0], ['rain', 63], ['snow', 75]] as const)('%s forecast', async (name, code) => {
    vi.stubEnv('WEATHER_BRIEFING_ENABLED', 'true');
    const telemetry = vi.spyOn(console, 'info');
    const now = Date.now(), raw = forecastFixture(now, code);
    raw.hourly.precipitation_probability = raw.hourly.time.map((_, i) => code === 0 ? 0 : i < 8 ? 80 : 10);
    if (code === 75) raw.hourly.temperature_2m = raw.hourly.time.map((_, i) => -3 + Math.sin(i / 4));
    const forecast = briefingForecast(normalizeWeather(raw, asheville, now), 'imperial', now);
    const response = await handleBriefing(new Request('http://localhost/api/weather-briefing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(forecast) }));
    const result: unknown = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(200); expect(isWeatherBriefing(result)).toBe(true);
    if (isWeatherBriefing(result)) {
      await writeFile(`/tmp/8bit-weather-briefing-${name}.json`, JSON.stringify({ ...result, telemetry: telemetry.mock.calls.find(call => call[0] === 'weather_briefing')?.[1] }, null, 2));
      expect(result.text.split(/\s+/).length).toBeLessThanOrEqual(75);
      console.info(`Live ${name} sample: ${result.text}`);
    }
  }, 20000);
});
