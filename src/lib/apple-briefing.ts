import { registerPlugin } from '@capacitor/core';
import { BRIEFING_TTL, BRIEFING_VERSION, HOUR, briefingFacts, validBriefingClaims, forecastUsable, type BriefingForecast, type WeatherBriefing } from './briefing';
import { appleBriefingInstructions, validSummary } from './briefing-prompt';
import { localDate, localTime, STALE_AFTER, temperature } from './weather';

export const MIN_APPLE_MODEL_OS = 27;
export const APPLE_BRIEFING_REVISION = 2;

interface AppleBriefingPlugin {
  availability(): Promise<{ available: boolean; reason?: string; modelOSMajor?: number }>;
  generate(options: { requestId: string; facts: string; instructions: string }): Promise<{ text: string }>;
  cancel(options: { requestId: string }): Promise<void>;
}
const AppleBriefing = registerPlugin<AppleBriefingPlugin>('AppleBriefing');

export interface AppleAvailability { available: boolean; reason?: string; modelOSMajor?: number }
export async function appleAvailability(): Promise<AppleAvailability> {
  const status = await AppleBriefing.availability();
  if (status.available && (!Number.isInteger(status.modelOSMajor) || status.modelOSMajor! < MIN_APPLE_MODEL_OS)) {
    return { available: false, reason: 'requires_ios27' };
  }
  return status;
}
export function appleUnavailableMessage(reason?: string): string {
  const messages: Record<string, string> = {
    requires_ios27: 'Apple Intelligence briefings require iOS 27 or later.',
    device_unsupported: 'This device does not support Apple Intelligence.',
    intelligence_disabled: 'Turn on Apple Intelligence in iPhone Settings to use on-device briefings.',
    model_not_ready: 'Apple Intelligence is still getting ready. Its model may need to finish downloading.',
    language_unsupported: 'Apple Intelligence cannot generate English briefings with the current language configuration.',
  };
  return messages[reason ?? ''] ?? 'Apple Intelligence is unavailable right now. Try again or switch to OpenAI.';
}

/** Compact calculated facts leave room for instructions and output in the on-device context.
 * All numbers, interval boundaries, and conversions come from forecast code. */
function appleFacts(forecast: BriefingForecast, now: number) {
  const facts = briefingFacts(forecast, now);
  const hours = forecast.hourly.filter(h => h.time < now / 1000 + 24 * HOUR && h.time + HOUR > now / 1000);
  const known = hours.flatMap(h => h.temperature === null ? [] : [h.temperature]);
  const today = localDate(now, forecast.timezone);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const daypart = (seconds: number) => {
    seconds = Math.max(seconds, now / 1000);
    const hour = Number(localTime(seconds, forecast.timezone, { hour: 'numeric', hourCycle: 'h23' }));
    const period = hour < 6 ? 'overnight' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const date = localDate(seconds * 1000, forecast.timezone);
    if (date === today) return period === 'overnight' ? 'early this morning' : `this ${period}`;
    if (date === tomorrow) return period === 'overnight' ? 'overnight' : `tomorrow ${period}`;
    return `${localTime(seconds, forecast.timezone, { weekday: 'long' })} ${period}`;
  };
  const periods: { period: string; chances: number[] }[] = [];
  hours.forEach((hour, index) => {
    const period = daypart(hour.time);
    if (periods.at(-1)?.period !== period) periods.push({ period, chances: [] });
    const group = periods.at(-1)!;
    const chance = facts.hours[index].precipitationChancePercent;
    if (chance !== null) group.chances.push(chance);
  });
  const unit = forecast.units === 'imperial' ? 'F' : 'C';
  const extreme = (value: number) => ({ value: temperature(value, forecast.units) + unit, period: daypart(hours.find(h => h.temperature === value)!.time) });
  const missingTemperatureHours = hours.length - known.length;
  const chances = facts.hours.flatMap(h => h.precipitationChancePercent === null ? [] : [h.precipitationChancePercent]);
  const peakChance = chances.length ? Math.max(...chances) : null;
  const high = known.length ? Math.max(...known) : null;
  const low = known.length ? Math.min(...known) : null;
  const missingPrecipitationHours = facts.hours.filter(h => h.precipitationChancePercent === null).length;
  const peakPeriods = periods.filter(group => peakChance !== null && group.chances.includes(peakChance)).map(group => group.period);
  const timing = peakPeriods.length <= 2 && peakChance !== null && peakChance > 20 ? ` ${peakPeriods.join(' and ')}` : '';
  const precipitationStatement = peakChance === null ? 'Precipitation data is unavailable.'
    : missingPrecipitationHours ? `Precipitation data is incomplete; available hourly chances peak at ${peakChance}%${timing}.`
    : peakChance === 0 ? 'Precipitation is not expected.'
    : `Hourly precipitation chances peak at ${peakChance}%${timing}.`;
  return {
    from: facts.from, until: facts.until, temperatureUnit: facts.temperatureUnit,
    coverage: {
      temperature: !known.length ? 'unavailable' : missingTemperatureHours ? 'partial' : 'complete',
      precipitation: !chances.length ? 'unavailable' : missingPrecipitationHours ? 'partial' : 'complete',
    },
    temperature: {
      pattern: high === null || low === null ? 'unknown' : high - low < 2 ? 'steady' : hours.findIndex(h => h.temperature === high) < hours.findIndex(h => h.temperature === low) ? 'cooling after the high' : 'warming after the low',
      ...(high !== null && low !== null && high - low < 2
        ? { steadyAt: temperature(high, forecast.units) + unit }
        : { high: high === null ? null : extreme(high), low: low === null ? null : extreme(low) }),
      ...(missingTemperatureHours ? { missingHours: missingTemperatureHours } : {}),
    },
    ...(missingPrecipitationHours ? { missingPrecipitationHours } : {}),
    precipitation: { statement: precipitationStatement },
  };
}

export function appleBriefingFacts(forecast: BriefingForecast, now: number): string {
  return JSON.stringify(appleFacts(forecast, now));
}

/** Check numeric claims independently of the model. Spelled-out probabilities
 * still require human model evaluation; this rejects unsupported explicit numbers. */
export function validAppleSummary(text: string, forecast: BriefingForecast, now: number): boolean {
  if (!validSummary(text) || !validBriefingClaims(text, forecast, now)) return false;
  // Compact Apple facts omit precipitation type. Do not infer rain, snow, or
  // storm advice from an all-type precipitation probability.
  if (/\b(?:rain(?:fall|y|wear|coats?)?|snow(?:fall|y)?|sleet|hail|showers?|thunder(?:storms?)?|wintry mix|umbrellas?|ponchos?)\b/i.test(text)) return false;
  const compact = appleFacts(forecast, now);
  // Real-device samples invented gaps when asked to interpret zero/missing counts.
  // Require the calculated precipitation sentence verbatim, then check the model's temperature prose.
  if (!text.endsWith(compact.precipitation.statement)) return false;
  const temperatureText = text.slice(0, -compact.precipitation.statement.length).trim();
  if (!temperatureText || /(?:^|[.!?]\s+)(?:temperature|precipitation)\s*:/i.test(text)) return false;
  if (compact.temperature.pattern === 'steady' && /\b(?:high|low)\b/i.test(temperatureText)) return false;
  const facts = briefingFacts(forecast, now);
  if (facts.hours.some(hour => hour.temperature === null) && facts.hours.some(hour => hour.temperature !== null)
    && /\bno (?:available )?readings\b/i.test(text)) return false;
  if (facts.hours.every(hour => hour.temperature === null) && !/\btemperature data is unavailable\b/i.test(text)) return false;
  if (facts.hours.every(hour => hour.precipitationChancePercent === null) && !/\bprecipitation data is unavailable\b/i.test(text)) return false;
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
    return { text, provider: 'apple' as const, appleModelOSMajor: status.modelOSMajor, applePromptRevision: APPLE_BRIEFING_REVISION, generatedAt, windowStart: now, windowEnd: now + 24 * HOUR * 1000,
      expiresAt: Math.min(generatedAt + BRIEFING_TTL, forecast.fetchedAt + STALE_AFTER), version: BRIEFING_VERSION };
  };
  try { return await Promise.race([generate(), interrupted]); }
  catch (error) {
    if ((error as { code?: string })?.code === 'CANCELLED') throw new DOMException('Aborted', 'AbortError');
    throw error;
  }
  finally { window.clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
