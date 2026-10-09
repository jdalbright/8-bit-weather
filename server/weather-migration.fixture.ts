import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { briefingInstructions } from '../src/lib/briefing-prompt.js';
import { outdoorInstructions, outdoorRequest, validOutdoorChoice } from '../src/lib/outdoor-ai.js';
import { outdoorWindows } from '../src/lib/outdoor.js';
import { outdoorSnapshot } from '../src/test/outdoor-fixtures.js';
import { fixtureTime } from '../src/test/fixtures.js';
import { comparisonForecast, comparisonScenarios, comparisonTime } from './briefing-scenarios.fixture.js';
import { openAIBriefingFacts, validOpenAISummary } from './openai-briefing.js';
import { previousBriefingInstructions, previousOutdoorInstructions } from './weather-migration-baseline.fixture.js';

// The first pair isolates model choice; the second isolates prompt changes.
export const migrationVariants = [
  { name: 'baseline', model: 'gpt-5.6-luna', revised: false },
  { name: 'model-only', model: 'gpt-6-luna', revised: false },
  { name: 'revised', model: 'gpt-6-luna', revised: true },
] as const;
export type MigrationVariant = typeof migrationVariants[number];
export interface MigrationCase {
  name: string;
  kind: 'briefing' | 'outdoor';
  facts: unknown;
  request: (variant: MigrationVariant) => ResponseCreateParamsNonStreaming;
  accepted: (text: string) => boolean;
  expectedStart?: number;
}

/** Fixed synthetic inputs only. No endpoint freshness checks are bypassed in production. */
export function migrationCases(): MigrationCase[] {
  const forecasts = comparisonScenarios.map(name => ({ name: String(name), forecast: comparisonForecast(name), now: comparisonTime }));
  const metric = comparisonForecast('incomplete'); metric.units = 'metric';
  forecasts.push({ name: 'metric-incomplete', forecast: metric, now: comparisonTime });
  const unavailable = comparisonForecast('steady');
  unavailable.hourly.forEach(hour => { hour.temperature = null; hour.precipitation = null; });
  forecasts.push({ name: 'measurements-unavailable', forecast: unavailable, now: comparisonTime });
  const dstTime = Date.parse('2026-11-01T03:30:00Z');
  forecasts.push({ name: 'midnight-dst-reversal', forecast: comparisonForecast('overnight-cooling', dstTime), now: dstTime });
  const cases: MigrationCase[] = forecasts.map(({ name, forecast, now }) => {
    const facts = openAIBriefingFacts(forecast, now);
    return {
      name, kind: 'briefing', facts,
      request: variant => ({ model: variant.model,
        instructions: variant.revised ? briefingInstructions : previousBriefingInstructions,
        input: JSON.stringify(facts), reasoning: { effort: 'none' }, max_output_tokens: 1000, store: false }),
      accepted: text => validOpenAISummary(text, forecast, now),
    };
  });
  for (const name of ['outdoor-tie', 'outdoor-heat', 'outdoor-ranking'] as const) {
    const now = fixtureTime + 1800000;
    const snapshot = outdoorSnapshot();
    if (name === 'outdoor-heat') snapshot.hourly.forEach(hour => { hour.temperature = 32; });
    if (name === 'outdoor-ranking') snapshot.hourly.forEach((hour, index) => {
      hour.precipitation = index % 3 === 0 ? 20 : 10;
      hour.temperature = index % 2 === 0 ? 24 : 22;
      hour.wind = index % 4 === 0 ? 12 : 8;
    });
    const request = outdoorRequest(snapshot, now, 'tomorrow', 'afternoon');
    const eligible = outdoorWindows(request.forecast, now, request.day, request.period);
    if (eligible.status !== 'recommended') throw new Error('Invalid synthetic outdoor fixture');
    const facts = { temperatureUnit: 'Celsius', windUnit: 'km/h', windows: eligible.windows };
    cases.push({
      name, kind: 'outdoor', facts, expectedStart: eligible.windows[0].start,
      request: variant => ({ model: variant.model,
        instructions: variant.revised ? outdoorInstructions : previousOutdoorInstructions,
        input: JSON.stringify(facts), reasoning: { effort: 'none' }, max_output_tokens: 350, store: false,
        text: { format: { type: 'json_schema', name: 'outdoor_recommendation', strict: true, schema: {
          type: 'object', properties: { start: { type: 'integer', enum: eligible.windows.map(hour => hour.start) }, text: { type: 'string' } },
          required: ['start', 'text'], additionalProperties: false,
        } } },
      }),
      accepted: text => {
        try { return validOutdoorChoice(JSON.parse(text), request, now); } catch { return false; }
      },
    });
  }
  return cases;
}
