import OpenAI from 'openai';
import { OUTDOOR_VERSION, outdoorInstructions, parseOutdoorRequest, validOutdoorChoice } from '../src/lib/outdoor-ai.js';
import { outdoorWindows } from '../src/lib/outdoor.js';
import { providerCooldown } from './provider-cooldown.js';

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/** Called only behind the briefing route's method, origin, activation, and body-size gates.
 * Sharing the canonical route also shares its published platform rate limit. */
export async function generateOutdoor(raw: unknown, signal: AbortSignal): Promise<Response> {
  const request = parseOutdoorRequest(raw);
  if (!request) return json({ code: 'invalid_forecast' }, 400);
  const now = Date.now();
  const eligible = outdoorWindows(request.forecast, now, request.day, request.period);
  if (eligible.status !== 'recommended') return json({ code: 'forecast_unavailable' }, 422);
  const model = process.env.OPENAI_WEATHER_MODEL || 'gpt-5.6-luna';
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 12000, maxRetries: 0 });
    const result = await client.responses.create({
      model, instructions: outdoorInstructions,
      input: JSON.stringify({ temperatureUnit: 'Celsius', windUnit: 'km/h', windows: eligible.windows }),
      reasoning: { effort: 'none' }, max_output_tokens: 350, store: false,
      text: { format: { type: 'json_schema', name: 'outdoor_recommendation', strict: true, schema: {
        type: 'object', properties: { start: { type: 'integer', enum: eligible.windows.map(hour => hour.start) }, text: { type: 'string' } },
        required: ['start', 'text'], additionalProperties: false,
      } } },
    }, { signal });
    let choice: unknown;
    try { choice = JSON.parse(result.output_text); } catch { /* Invalid output is withheld. */ }
    const generatedAt = Date.now();
    if (result.status !== 'completed' || !validOutdoorChoice(choice, request, generatedAt)) return json({ code: 'recommendation_unavailable' }, 502);
    const expiresAt = Math.min(generatedAt + 900000, eligible.forecastAt + 3600000, choice.start * 1000);
    if (expiresAt <= generatedAt) return json({ code: 'forecast_unavailable' }, 422);
    console.info('outdoor_recommendation', { model, durationMs: generatedAt - now, inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens });
    return json({ version: OUTDOOR_VERSION, start: choice.start, text: choice.text.trim(), generatedAt, expiresAt });
  } catch (error) {
    const limited = error instanceof OpenAI.APIError && error.status === 429;
    console.info('outdoor_recommendation', { model, durationMs: Date.now() - now, outcome: limited ? 'rate_limited' : 'unavailable' });
    return json({ code: limited ? 'rate_limited' : 'recommendation_unavailable' }, limited ? 429 : 503,
      limited ? { 'Retry-After': providerCooldown(error.headers) } : {});
  }
}
