import { HOUR, type BriefingForecast } from '../src/lib/briefing.js';

export const comparisonScenarios = ['steady', 'overnight-cooling', 'warming', 'low-chances', 'showers', 'snow', 'thunderstorms', 'incomplete'] as const;
export type ComparisonScenario = typeof comparisonScenarios[number];
export const comparisonTime = Date.parse('2026-09-11T18:30:00Z');

/** Synthetic, deterministic inputs. The evaluation sends no actual user location. */
export function comparisonForecast(scenario: ComparisonScenario, now = comparisonTime): BriefingForecast {
  const start = Math.floor(now / 1000 / HOUR) * HOUR;
  const hourly = Array.from({ length: 26 }, (_, i) => ({
    time: start + i * HOUR, temperature: 22 as number | null,
    precipitation: 0 as number | null, code: 0 as number | null, isDay: true,
  }));
  const f: BriefingForecast = { timezone: 'America/New_York', fetchedAt: now, observationTime: start, units: 'imperial', hourly };
  if (scenario === 'overnight-cooling') hourly.forEach((hour, i) => { hour.temperature = i < 16 ? 26 - i : 10 + (i - 15); });
  if (scenario === 'warming') hourly.forEach((hour, i) => { hour.temperature = 5 + i; });
  if (scenario === 'low-chances') hourly.forEach((hour, i) => { hour.precipitation = (i % 5) * 5; hour.code = 2; });
  if (scenario === 'showers' || scenario === 'snow' || scenario === 'thunderstorms') {
    hourly.forEach((hour, i) => {
      hour.code = i >= 4 && i < 10 ? scenario === 'snow' ? 73 : scenario === 'thunderstorms' ? 95 : 80 : 3;
      // Probability belongs to the interval ending at this timestamp.
      hour.precipitation = i >= 5 && i <= 10 ? 80 : 10;
      hour.temperature = scenario === 'snow' ? -1 - i / 8 : 25 - i / 4;
    });
  }
  if (scenario === 'incomplete') {
    hourly[0].temperature = null;
    hourly[5].precipitation = null;
    hourly[8].code = null;
  }
  return f;
}
