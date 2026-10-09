import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { migrationCases, migrationVariants } from './weather-migration.fixture';
import { OPENAI_BRIEFING_REVISION } from './openai-briefing';
import { OUTDOOR_PROMPT_REVISION } from './outdoor';

// Explicit opt-in only: normal tests never spend tokens, even with a key present.
describe.skipIf(process.env.RUN_LIVE_WEATHER_MIGRATION !== 'true')('weather model migration (42 paid calls maximum)', () => {
  it('records independent model and prompt comparisons for manual review', async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error('An existing server-side OPENAI_API_KEY is required.');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 12000, maxRetries: 0 });
    const directory = await mkdtemp(join(tmpdir(), '8bit-weather-migration-'));
    const path = join(directory, 'comparison.json');
    console.info(`Migration report: ${path}`);
    const samples: unknown[] = [];
    let requests = 0;
    const cases = migrationCases();
    const selectedVariants = process.env.WEATHER_MIGRATION_REVISED_ONLY === 'true'
      ? migrationVariants.filter(variant => variant.revised) : [...migrationVariants];
    for (const [index, sample] of cases.entries()) {
      // Rotate all three positions to distribute request-order effects.
      const offset = index % selectedVariants.length;
      const variants = [...selectedVariants.slice(offset), ...selectedVariants.slice(0, offset)];
      const outputs: Record<string, unknown> = {};
      let stop = false;
      for (const variant of variants) {
        const started = Date.now(); requests++;
        try {
          const request = sample.request(variant);
          const response = await client.responses.create(request);
          const text = response.output_text?.trim() ?? '';
          let chosenStart: unknown;
          if (sample.kind === 'outdoor') {
            try { chosenStart = JSON.parse(text).start; } catch { /* Retain invalid output for review. */ }
          }
          outputs[variant.name] = { requestedModel: variant.model, returnedModel: response.model,
            promptSha256: createHash('sha256').update(request.instructions ?? '').digest('hex'),
            status: response.status, text, durationMs: Date.now() - started,
            inputTokens: response.usage?.input_tokens, cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens,
            outputTokens: response.usage?.output_tokens, reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens,
            accepted: response.status === 'completed' && sample.accepted(text),
            ...(sample.kind === 'outdoor' ? { choosesTopRankedHour: chosenStart === sample.expectedStart } : {}),
          };
        } catch (error) {
          // Never serialize raw SDK errors, headers, requests, or credentials.
          const status = error instanceof OpenAI.APIError ? error.status : undefined;
          outputs[variant.name] = { status: 'request_failed', httpStatus: status ?? null,
            durationMs: Date.now() - started, accepted: false };
          // Stop on infrastructure/access failures rather than repeat paid or doomed calls.
          stop = true;
          break;
        }
      }
      samples.push({ name: sample.name, kind: sample.kind, facts: sample.facts, expectedStart: sample.expectedStart, outputs,
        review: { factuallyCorrect: null, preferred: null, notes: '' } });
      await writeFile(path, JSON.stringify({ createdAt: new Date().toISOString(), requests,
        briefingRevision: OPENAI_BRIEFING_REVISION, outdoorRevision: OUTDOOR_PROMPT_REVISION,
        reviewStatus: 'pending-manual-review', completed: !stop && samples.length === cases.length,
        variants: selectedVariants, samples }, null, 2));
      if (stop) throw new Error(`Migration comparison stopped after a provider/connection failure. Redacted report: ${path}`);
    }
    expect(requests).toBe(cases.length * selectedVariants.length);
    // Collection alone is not a quality pass. Review all text and failures before release.
  }, 600000);
});
