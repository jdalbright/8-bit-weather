import { registerPlugin } from '@capacitor/core';
import { BRIEFING_TTL, BRIEFING_VERSION, HOUR, briefingFacts, forecastUsable, type BriefingForecast, type WeatherBriefing } from './briefing';
import { appleBriefingInstructions, validSummary } from './briefing-prompt';
import { localTime, STALE_AFTER, temperature } from './weather';

export const MIN_APPLE_MODEL_OS = 27;

interface AppleBriefingPlugin {
  availability(): Promise<{ available: boolean; reason?: string; modelOSMajor?: number }>;
  generate(options: { requestId: string; facts: string; instructions: string }): Promise<{ text: string }>;
  cancel(options: { requestId: string }): Promise<void>;
}
const AppleBriefing = registerPlugin<AppleBriefingPlugin>('AppleBriefing');

/** Compact calculated facts leave room for instructions and output in the on-device context.
 * All numbers, interval boundaries, and conversions come from forecast code. */
export function appleBriefingFacts(forecast: BriefingForecast, now: number): string {
  const facts = briefingFacts(forecast, now);
  const hours = forecast.hourly.filter(h => h.time < now / 1000 + 24 * HOUR && h.time + HOUR > now / 1000);
  const known = hours.flatMap(h => h.temperature === null ? [] : [h.temperature]);
  const label = (seconds: number) => localTime(seconds, forecast.timezone,
    { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const intervals = <T,>(values: T[]) => {
    const groups: { from: string; until: string; value: T }[] = [];
    for (let i = 0; i < hours.length; i++) {
      const from = label(Math.max(now / 1000, hours[i].time));
      const until = label(Math.min(now / 1000 + 24 * HOUR, hours[i].time + HOUR));
      if (groups.length && groups.at(-1)!.value === values[i]) groups.at(-1)!.until = until;
      else groups.push({ from, until, value: values[i] });
    }
    return groups;
  };
  return JSON.stringify({
    from: facts.from, until: facts.until, temperatureUnit: facts.temperatureUnit,
    temperature: {
      knownRange: known.length ? [temperature(Math.min(...known), forecast.units), temperature(Math.max(...known), forecast.units)] : null,
      atStart: facts.hours[0].temperature, atEnd: facts.hours.at(-1)!.temperature,
      missingHours: hours.length - known.length,
    },
    missingPrecipitationHours: facts.hours.filter(h => h.precipitationChancePercent === null).length,
    precipitationChancePercent: intervals(facts.hours.map(h => h.precipitationChancePercent)),
    conditions: intervals(facts.hours.map(h => h.conditions)),
  });
}

/** Check numeric claims independently of the model. Spelled-out probabilities
 * still require human model evaluation; this rejects unsupported explicit numbers. */
export function validAppleSummary(text: string, forecast: BriefingForecast, now: number): boolean {
  if (!validSummary(text)) return false;
  const facts = briefingFacts(forecast, now);
  const missingTemperature = facts.hours.some(h => h.temperature === null);
  const missingPrecipitation = facts.hours.some(h => h.precipitationChancePercent === null);
  if ((missingTemperature || missingPrecipitation) && !/\b(available|known|missing|unknown|incomplete|unavailable|limited)\b/i.test(text)) return false;
  // Partial data must not become a claim that all readings are absent. Treat
  // ambiguous local wording conservatively and let the cloud fallback handle it.
  if (missingTemperature && facts.hours.some(h => h.temperature !== null) && /no (?:available )?(?:readings|temperature (?:data|readings))/i.test(text)) return false;
  if (missingPrecipitation && /no chance|no (?:rain|precipitation)|(?:remain|stay|expect) dry|dry (?:weather|throughout)|zero (?:chance|percent)/i.test(text)) return false;
  const probabilities = new Set(facts.hours.flatMap(h => h.precipitationChancePercent === null ? [] : [h.precipitationChancePercent]));
  const temperatures = new Set(facts.hours.flatMap(h => h.temperature === null ? [] : [Number.parseFloat(h.temperature)]));
  for (const match of text.replaceAll('−', '-').matchAll(/(-?\d+(?:\.\d+)?)\s*(%|percent|degrees?|°)/gi)) {
    const allowed = /%|percent/i.test(match[2]) ? probabilities : temperatures;
    if (!allowed.has(Number(match[1]))) return false;
  }
  return true;
}

export async function generateAppleBriefing(forecast: BriefingForecast, signal: AbortSignal): Promise<WeatherBriefing> {
  const requestId = crypto.randomUUID();
  const now = Date.now();
  let stopped = false;
  let timer: number | undefined;
  let abort: () => void = () => {};
  const cancel = () => { stopped = true; void AppleBriefing.cancel({ requestId }).catch(() => {}); };
  const interrupted = new Promise<never>((_, reject) => {
    abort = () => { cancel(); reject(new DOMException('Aborted', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    timer = window.setTimeout(() => { cancel(); reject(new Error('apple_timeout')); }, 20000);
    if (signal.aborted) abort();
  });
  const generate = async (): Promise<WeatherBriefing> => {
    if (stopped) throw new DOMException('Aborted', 'AbortError');
    const status = await AppleBriefing.availability();
    if (stopped) throw new DOMException('Aborted', 'AbortError');
    if (!status.available) throw new Error(status.reason || 'apple_unavailable');
    // An older installed bridge must not silently select the iOS 26 model.
    if (!Number.isInteger(status.modelOSMajor) || status.modelOSMajor! < MIN_APPLE_MODEL_OS) throw new Error('requires_ios27');
    if (!forecastUsable(forecast, now)) throw new Error('forecast_unavailable');
    const result = await AppleBriefing.generate({ requestId, facts: appleBriefingFacts(forecast, now), instructions: appleBriefingInstructions });
    if (stopped) throw new DOMException('Aborted', 'AbortError');
    const text = result.text?.trim();
    const generatedAt = Date.now();
    if (!text || !validAppleSummary(text, forecast, now) || !forecastUsable(forecast, generatedAt)) throw new Error('apple_invalid_summary');
    return { text, provider: 'apple' as const, appleModelOSMajor: status.modelOSMajor, generatedAt, windowStart: now, windowEnd: now + 24 * HOUR * 1000,
      expiresAt: Math.min(generatedAt + BRIEFING_TTL, forecast.fetchedAt + STALE_AFTER), version: BRIEFING_VERSION };
  };
  try { return await Promise.race([generate(), interrupted]); }
  catch (error) {
    if ((error as { code?: string })?.code === 'CANCELLED') throw new DOMException('Aborted', 'AbortError');
    throw error;
  }
  finally { window.clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
