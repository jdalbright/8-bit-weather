import OpenAI from 'openai';
import { BRIEFING_PATH, BRIEFING_TTL, BRIEFING_VERSION, forecastUsable, parseBriefingForecast } from '../src/lib/briefing.js';

import { briefingInstructions } from '../src/lib/briefing-prompt.js';
import { OPENAI_BRIEFING_REVISION, openAIBriefingFacts, validOpenAISummary } from './openai-briefing.js';
export { briefingInstructions } from '../src/lib/briefing-prompt.js';

const MAX_BODY_BYTES = 12000;

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

function isNativeOrigin(origin: string): boolean {
  // Compare complete, serialized origins. Never permit wildcard, opaque ("null"),
  // credentials, paths, or substring matches. Capacitor's custom scheme has a
  // WHATWG URL.origin of "null", so serialize its scheme and host explicitly.
  try {
    const url = new URL(origin);
    if (!['capacitor:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password
      || origin !== `${url.protocol}//${url.host}`) return false;
    return (process.env.WEATHER_BRIEFING_NATIVE_ORIGINS ?? '').split(',').map(value => value.trim()).includes(origin);
  } catch { return false; }
}

export async function handleBriefing(request: Request): Promise<Response> {
  // Vercel can resolve aliases such as /api/weather-briefing.ts to this function.
  // Only the canonical path is covered by the published firewall rule.
  if (new URL(request.url).pathname !== BRIEFING_PATH) return json({ code: 'not_found' }, 404);
  const origin = request.headers.get('origin');
  const nativeOrigin = origin !== null && isNativeOrigin(origin);
  if (origin && origin !== new URL(request.url).origin && !nativeOrigin) return json({ code: 'invalid_origin' }, 403);
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (nativeOrigin) {
    headers['Access-Control-Allow-Origin'] = origin!;
    // Provider rate-limit responses remain readable in the native WebView.
    headers['Access-Control-Expose-Headers'] = 'Retry-After';
  }
  if (request.method === 'OPTIONS') {
    const requestedHeaders = (request.headers.get('access-control-request-headers') ?? '')
      .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    if (!nativeOrigin || request.headers.get('access-control-request-method') !== 'POST'
      || requestedHeaders.some(header => header !== 'content-type')) return json({ code: 'invalid_preflight' }, 403);
    return new Response(null, { status: 204, headers: {
      ...headers, 'Cache-Control': 'no-store', 'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600',
      Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    } });
  }
  const response = await generateBriefing(request);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

async function generateBriefing(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405, { Allow: 'POST' });
  // Disabled by default. Public activation requires the endpoint's WAF rate-limit rule.
  if (process.env.WEATHER_BRIEFING_ENABLED !== 'true' || !process.env.OPENAI_API_KEY) return json({ code: 'disabled' }, 503);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ code: 'invalid_request' }, 415);
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
      model, instructions: briefingInstructions, input: JSON.stringify(openAIBriefingFacts(forecast, now)),
      reasoning: { effort: 'none' }, max_output_tokens: 250, store: false,
    }, { signal: request.signal });
    const text = result.output_text?.trim();
    if (result.status !== 'completed' || !text || !validOpenAISummary(text, forecast, now)) {
      console.info('weather_briefing', { model, promptRevision: OPENAI_BRIEFING_REVISION, durationMs: Date.now() - started, outcome: 'invalid_summary' });
      return json({ code: 'briefing_unavailable' }, 502);
    }
    const generatedAt = Date.now();
    if (generatedAt >= forecast.fetchedAt + 45 * 60000) return json({ code: 'forecast_unavailable' }, 422);
    // Log operational metadata only; never credentials, locations, prompts, or provider errors.
    console.info('weather_briefing', { model, promptRevision: OPENAI_BRIEFING_REVISION, durationMs: generatedAt - started, inputTokens: result.usage?.input_tokens, outputTokens: result.usage?.output_tokens });
    return json({ text, generatedAt, windowStart: now, windowEnd: now + 86400000,
      expiresAt: Math.min(generatedAt + BRIEFING_TTL, forecast.fetchedAt + 45 * 60000), version: BRIEFING_VERSION });
  } catch (error) {
    const limited = error instanceof OpenAI.APIError && error.status === 429;
    console.info('weather_briefing', { model, promptRevision: OPENAI_BRIEFING_REVISION, durationMs: Date.now() - started, outcome: limited ? 'rate_limited' : 'unavailable' });
    return json({ code: limited ? 'rate_limited' : 'briefing_unavailable' }, limited ? 429 : 503,
      limited ? { 'Retry-After': providerCooldown(error.headers) } : {});
  }
}
