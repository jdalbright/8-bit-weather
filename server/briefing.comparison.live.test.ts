import OpenAI from 'openai';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { briefingFacts } from '../src/lib/briefing';
import { briefingInstructions, validSummary } from '../src/lib/briefing-prompt';
import { baselineBriefingInstructions } from './briefing-baseline.fixture';
import { comparisonForecast, comparisonScenarios, comparisonTime } from './briefing-scenarios.fixture';
import { OPENAI_BRIEFING_REVISION, openAIBriefingFacts, validOpenAISummary } from './openai-briefing';

// Separate opt-in from the older three-sample smoke test. CI never spends tokens.
describe.skipIf(process.env.RUN_LIVE_BRIEFING_COMPARISON !== 'true')('OpenAI briefing comparison (16 paid calls)', () => {
  it('records paired outputs for manual factual and quality review', async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('The comparison requires an existing server-side OPENAI_API_KEY.');
    const model = process.env.OPENAI_WEATHER_MODEL || 'gpt-5.6-luna';
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 12000, maxRetries: 0 });
    const directory = await mkdtemp(join(tmpdir(), '8bit-briefing-comparison-'));
    const samples: unknown[] = [];
    let requests = 0;
    for (const [index, scenario] of comparisonScenarios.entries()) {
      const forecast = comparisonForecast(scenario);
      const outputs: Record<string, unknown> = {};
      // Alternate order so cold starts and request order do not always favor one pipeline.
      for (const variant of index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
        const candidate = variant === 'candidate';
        const input = candidate ? openAIBriefingFacts(forecast, comparisonTime) : briefingFacts(forecast, comparisonTime);
        const instructions = candidate ? briefingInstructions : baselineBriefingInstructions;
        const started = Date.now();
        requests++;
        try {
          const response = await client.responses.create({ model, instructions, input: JSON.stringify(input),
            reasoning: { effort: 'none' }, max_output_tokens: candidate ? 1000 : 250, store: false });
          const text = response.output_text?.trim() ?? '';
          outputs[variant] = {
            status: response.status, text, durationMs: Date.now() - started,
            inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens,
            acceptedByPipeline: response.status === 'completed' && (candidate ? validOpenAISummary(text, forecast, comparisonTime) : validSummary(text)),
            passesCandidateChecks: validOpenAISummary(text, forecast, comparisonTime),
          };
        } catch {
          // Retain the failed sample without exposing a provider error or retrying.
          outputs[variant] = { status: 'request_failed', durationMs: Date.now() - started, acceptedByPipeline: false };
        }
      }
      samples.push({ scenario, forecast, facts: openAIBriefingFacts(forecast, comparisonTime), outputs,
        review: { candidateFactuallyCorrect: null, preferred: null, emphasis: null, naturalness: null, repetition: null, notes: '' } });
      // Preserve progress if the process is interrupted; outputs contain synthetic data only.
      await writeFile(join(directory, 'comparison.json'), JSON.stringify({ model, promptRevision: OPENAI_BRIEFING_REVISION,
        comparisonTime, requests, reviewStatus: 'pending-manual-review',
        acceptance: 'All eight candidate outputs accepted and factually correct; candidate preferred in at least six of eight pairs.', samples }, null, 2));
    }
    expect(requests).toBe(16);
    console.info(`Briefing comparison recorded for manual review: ${join(directory, 'comparison.json')}`);
    // Completing this test establishes report collection, not a quality pass.
  }, 240000);
});
