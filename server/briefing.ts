import OpenAI from 'openai';
import { BRIEFING_PATH, BRIEFING_TTL, BRIEFING_VERSION, briefingFacts, forecastUsable, parseBriefingForecast } from '../src/lib/briefing.js';

const factualInstructions = `Write an English weather briefing for the supplied 24-hour window using ONLY the supplied hourly forecast. Give 2–3 sentences, at most 75 words, in plain text. Cover the temperature trend/range, precipitation timing and chance, and notable changes only when the data supports them. The listed precipitation probability belongs to its displayed interval. Missing values are unknown, never zero. Preserve uncertainty: probability is not a promise. Do not invent amounts, wind forecasts, warnings, official alerts, or exact onset times. Do not extrapolate outside the supplied window. Use the supplied local day/time labels and temperature unit. Avoid relative phrases like "in an hour" that become misleading in a cached summary. Include one everyday practical takeaway if justified. No heading, markdown, greeting, sign-off, or mention of being an AI.`;
const personalities = { 'warm-practical': 'Speak warmly and naturally, like a helpful neighbor. Use simple dayparts such as this evening, overnight, and tomorrow afternoon; avoid full dates, timezone abbreviations, and unnecessary minute precision. Focus on the most useful change, not an inventory of intervals. Group low precipitation chances together instead of listing every small peak. Never say "supplied window", "listed intervals", or describe your input data. Keep advice practical and restrained; no game jargon, jokes, or alarmism.' };

export const briefingInstructions = `${factualInstructions}\n${personalities['warm-practical']}`;
const MAX_BODY_BYTES = 12000;
const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

function validSummary(text: string): boolean {
  if (!text || text.length > 1600 || text.split(/\s+/).length > 75) return false;
  const sentences = [...sentenceSegmenter.segment(text)].filter(part => part.segment.trim());
  return sentences.length >= 2 && sentences.length <= 3;
}

function providerCooldown(headers: Headers | undefined): string {
  const milliseconds = Number(headers?.get('retry-after-ms'));
  if (Number.isFinite(milliseconds) && milliseconds > 0) return String(Math.ceil(milliseconds / 1000));
  const value = headers?.get('retry-after');
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return String(Math.ceil(seconds));
    const date = Date.parse(value);
    if (Number.isFinite(date) && date > Date.now()) return String(Math.ceil((date - Date.now()) / 1000));
  }
  return '60';
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...extra } });
}

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid_body');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('body_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(buffer));
}

export async function handleBriefing(request: Request): Promise<Response> {
  // Vercel can resolve aliases such as /api/weather-briefing.ts to this function.
  // Only the canonical path is covered by the published firewall rule.
  if (new URL(request.url).pathname !== BRIEFING_PATH) return json({ code: 'not_found' }, 404);
  if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405, { Allow: 'POST' });
  // Disabled by default. Public activation requires the endpoint's WAF rate-limit rule.
  if (process.env.WEATHER_BRIEFING_ENABLED !== 'true' || !process.env.OPENAI_API_KEY) return json({ code: 'disabled' }, 503);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ code: 'invalid_request' }, 415);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ code: 'invalid_origin' }, 403);
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return json({ code: 'body_too_large' }, 413);
  let raw: unknown;
  try { raw = await readBody(request); }
  catch (error) { return json({ code: 'invalid_request' }, error instanceof Error && error.message === 'body_too_large' ? 413 : 400); }
  const forecast = parseBriefingForecast(raw);
  if (!forecast) return json({ code: 'invalid_forecast' }, 400);
  const now = Date.now();
  if (!forecastUsable(forecast, now)) return json({ code: 'forecast_unavailable' }, 422);
  const model = process.env.OPENAI_WEATHER_MODEL || 'gpt-5.6-luna';
  const started = Date.now();
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 12000, maxRetries: 0 });
    const result = await client.responses.create({
      model, instructions: briefingInstructions, input: JSON.stringify(briefingFacts(forecast, now)),
      reasoning: { effort: 'none' }, max_output_tokens: 250, store: false,
    }, { signal: request.signal });
    const text = result.output_text?.trim();
    if (result.status !== 'completed' || !text || !validSummary(text)) return json({ code: 'briefing_unavailable' }, 502);
    const generatedAt = Date.now();
    if (generatedAt >= forecast.fetchedAt + 45 * 60000) return json({ code: 'forecast_unavailable' }, 422);
    // Log operational metadata only; never credentials, locations, prompts, or provider errors.
    console.info('weather_briefing', { model, durationMs: generatedAt - started, inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens });
    return json({ text, generatedAt, windowStart: now, windowEnd: now + 86400000,
      expiresAt: Math.min(generatedAt + BRIEFING_TTL, forecast.fetchedAt + 45 * 60000), version: BRIEFING_VERSION });
  } catch (error) {
    const limited = error instanceof OpenAI.APIError && error.status === 429;
    console.info('weather_briefing', { model, durationMs: Date.now() - started, outcome: limited ? 'rate_limited' : 'unavailable' });
    return json({ code: limited ? 'rate_limited' : 'briefing_unavailable' }, limited ? 429 : 503,
      limited ? { 'Retry-After': providerCooldown(error.headers) } : {});
  }
}
