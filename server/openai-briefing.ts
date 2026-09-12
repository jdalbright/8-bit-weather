import { briefingFacts, HOUR, type BriefingForecast } from '../src/lib/briefing.js';
import { THUNDERSTORM_TAKEAWAY, MAX_BRIEFING_TEXT_LENGTH } from '../src/lib/briefing-prompt.js';
import { localDate, localTime, temperature, weatherInfo } from '../src/lib/weather.js';

export const OPENAI_BRIEFING_REVISION = '4:fuller-explanations-coverage';

/** Server-only interpretation of the existing wire format. Probabilities still
 * describe individual intervals, never a whole-day or whole-daypart probability. */
export function openAIBriefingFacts(forecast: BriefingForecast, now: number) {
  const aligned = briefingFacts(forecast, now);
  const start = now / 1000, end = start + 24 * HOUR;
  const hours = forecast.hourly.filter(hour => hour.time < end && hour.time + HOUR > start);
  const today = localDate(now, forecast.timezone);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const daypart = (time: number) => {
    const clipped = Math.max(start, time);
    const date = localDate(clipped * 1000, forecast.timezone);
    const hour = Number(localTime(clipped, forecast.timezone, { hour: 'numeric', hourCycle: 'h23' }));
    const part = hour < 6 ? 'overnight' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    if (date === today) return part === 'overnight' ? 'early this morning' : `this ${part}`;
    if (date === tomorrow) return part === 'overnight' ? 'overnight' : `tomorrow ${part}`;
    return `${localTime(clipped, forecast.timezone, { weekday: 'long' })} ${part}`;
  };
  const known = hours.flatMap((hour, index) => hour.temperature === null ? [] : [{ index, celsius: hour.temperature }]);
  const high = known.reduce<(typeof known)[number] | null>((best, item) => !best || item.celsius > best.celsius ? item : best, null);
  const low = known.reduce<(typeof known)[number] | null>((best, item) => !best || item.celsius < best.celsius ? item : best, null);
  const steady = high !== null && low !== null && high.celsius - low.celsius < 2;
  const point = (item: (typeof known)[number]) => ({
    temperature: `${temperature(item.celsius, forecast.units)}${forecast.units === 'imperial' ? 'F' : 'C'}`,
    period: daypart(hours[item.index].time),
  });
  // Keep start/end alongside extrema: a cool night followed by a warm morning
  // must not be reduced to a misleading one-direction temperature trend.
  const selected = known.length ? [known[0], low!, high!, known.at(-1)!] : [];
  const timeline = [...new Map(selected.map(item => [item.index, item])).values()]
    .sort((a, b) => a.index - b.index).map(point)
    .filter((item, index, all) => index === 0 || item.temperature !== all[index - 1].temperature);
  const periods: { period: string; peakChancePercent: number | null; missingIntervals: number }[] = [];
  const conditions: { condition: string; kind: string; from: string; through: string }[] = [];
  hours.forEach((hour, index) => {
    const period = daypart(hour.time);
    if (periods.at(-1)?.period !== period) periods.push({ period, peakChancePercent: null, missingIntervals: 0 });
    const group = periods.at(-1)!;
    const chance = aligned.hours[index].precipitationChancePercent;
    if (chance === null) group.missingIntervals++;
    else group.peakChancePercent = Math.max(group.peakChancePercent ?? 0, chance);
    const info = weatherInfo(hour.code, hour.isDay);
    // Group ordinary clear-sky day/night label changes, retaining intensity and
    // freezing/hail distinctions for precipitation. Unknowns interrupt a run.
    const condition = info.kind === 'clear' ? 'Clear or mostly clear skies' : info.label;
    const previous = conditions.at(-1);
    if (previous?.condition === condition) previous.through = period;
    else conditions.push({ condition, kind: info.kind, from: period, through: period });
  });
  const chances = aligned.hours.flatMap(hour => hour.precipitationChancePercent === null ? [] : [hour.precipitationChancePercent]);
  const peak = chances.length ? Math.max(...chances) : null;
  const meaningfulChances = peak !== null && peak > 20;
  const coverage = (missing: number) => ({ status: missing === 0 ? 'complete' : missing === hours.length ? 'unavailable' : 'partial', missingIntervals: missing });
  return {
    from: aligned.from, until: aligned.until, temperatureUnit: aligned.temperatureUnit,
    lead: conditions.some(run => run.kind === 'storm' || run.kind === 'snow') ? 'snow-or-thunderstorms'
      : peak !== null && peak > 20 ? 'precipitation-timing' : 'temperature',
    coverage: {
      temperature: coverage(hours.length - known.length),
      precipitation: coverage(hours.length - chances.length),
      conditions: coverage(hours.filter(hour => weatherInfo(hour.code).kind === 'unknown').length),
    },
    temperature: steady ? { pattern: 'steady', steadyAt: point(high!).temperature, timeline: [] }
      : { pattern: known.length ? 'changing' : 'unknown', steadyAt: null, timeline },
    precipitation: {
      peakChancePercent: peak,
      pattern: peak === null ? 'unknown' : peak <= 20 ? 'low-chances' : 'highlight-peak-periods',
      // Low chances do not need an inventory of every daypart for the model to
      // copy. Retain missing-data timing independently of the chance summary.
      peakPeriods: meaningfulChances ? periods.filter(period => period.peakChancePercent === peak).map(period => period.period) : [],
      periods: meaningfulChances ? periods : [],
      missingPeriods: periods.filter(period => period.missingIntervals > 0).map(period => period.period),
    },
    conditions,
    thunderstormTakeaway: conditions.some(run => run.kind === 'storm') ? THUNDERSTORM_TAKEAWAY : null,
  };
}

/** Bounded checks for explicit numeric and coverage claims, not a semantic proof.
 * Timing, spelled-out numbers and practical advice also need model evaluation. */
export function validOpenAISummary(text: string, forecast: BriefingForecast, now: number): boolean {
  if (!text.trim() || text.length > MAX_BRIEFING_TEXT_LENGTH) return false;
  const hasThunderstorms = forecast.hourly.some(hour => hour.time < now / 1000 + 24 * HOUR && hour.time + HOUR > now / 1000
    && weatherInfo(hour.code).kind === 'storm');
  // Rain gear is never an allowed takeaway in a briefing containing thunderstorm
  // forecasts. Even a separate shower period cannot turn it into storm protection.
  if (hasThunderstorms && /\b(?:umbrellas?|raincoats?|ponchos?|rain\s*gear|rainwear)\b/i.test(text)) return false;
  const facts = briefingFacts(forecast, now);
  const normalized = text.replaceAll('−', '-');
  const probabilities = new Set(facts.hours.flatMap(hour => hour.precipitationChancePercent === null ? [] : [hour.precipitationChancePercent]));
  const temperatures = new Set(facts.hours.flatMap(hour => hour.temperature === null ? [] : [Number.parseFloat(hour.temperature)]));
  // A range's two endpoints share its trailing unit ("58–76°F", "10 to 20%").
  const numbers = /(-?\d+(?:\.\d+)?)(?:\s*(?:–|—|-|to|and)\s*(-?\d+(?:\.\d+)?))?\s*(%|percent\b|degrees?(?:\s*(?:Fahrenheit|Celsius|[FC]\b))?|°\s*[FC]?)/gi;
  for (const match of normalized.matchAll(numbers)) {
    const probability = /%|percent/i.test(match[3]);
    const allowed = probability ? probabilities : temperatures;
    if (!allowed.has(Number(match[1])) || (match[2] !== undefined && !allowed.has(Number(match[2])))) return false;
    if (!probability && (forecast.units === 'imperial' ? /C|Celsius/i : /F|Fahrenheit/i).test(match[3])) return false;
  }
  const missingTemperature = facts.hours.some(hour => hour.temperature === null);
  const missingPrecipitation = facts.hours.some(hour => hour.precipitationChancePercent === null);
  // Match each measurement separately: "available temperatures" cannot excuse
  // an unsupported claim about rain, or vice versa.
  const missingClaim = (topic: string, otherTopic: string) => {
    const missing = '(?:missing|unknown|incomplete|unavailable|limited|partial)';
    // A comma can connect "precipitation data ..., though the data is incomplete".
    // Another measurement or sentence boundary still ends that topic's scope.
    const sameTopic = `(?:(?!\\b(?:${otherTopic})\\b)[^.!?;]){0,45}`;
    return new RegExp(`(?:${topic})${sameTopic}\\b${missing}\\b|\\b${missing}(?:\\s+(?:data|readings|information|coverage|for|on|about|the)){0,4}\\s+(?:${topic})|\\bno (?:available )?(?:${topic})(?: data| readings?| information)?`, 'i');
  };
  const temperatureMissingClaim = missingClaim('temperatures?', 'rain|precipitation');
  const rainMissingClaim = missingClaim('rain|precipitation', 'temperatures?');
  if (!missingTemperature && temperatureMissingClaim.test(text)) return false;
  if (!missingPrecipitation && rainMissingClaim.test(text)) return false;
  const availableTemperatures = /\b(?:available|known) (?:temperature|readings)|\b(?:temperature|readings)[^.!?;,]{0,40}\b(?:available|known)\b/i.test(text);
  if (temperatures.size === 0 && availableTemperatures) return false;
  if (missingTemperature && !availableTemperatures && !temperatureMissingClaim.test(text)) return false;
  if (missingPrecipitation && !rainMissingClaim.test(text)) return false;
  if (missingPrecipitation && /\b(?:no|zero) (?:chance|rain|snow|precipitation)|\b(?:stay|stays|remain|remains|expect|be|is|looks?) (?:\w+ ){0,2}dry\b|\bdry (?:weather|throughout|conditions|day|night)|\b(?:won't|will not) (?:rain|snow)\b/i.test(text)) return false;
  if (missingTemperature && temperatures.size > 0 && /\bno (?:available )?temperature (?:data|readings)|\ball temperature (?:data|readings)[^.!?;]{0,20}(?:missing|unavailable)/i.test(text)) return false;
  if (missingPrecipitation && probabilities.size > 0 && /\bno (?:available )?(?:rain|precipitation) (?:data|readings)|\ball (?:rain|precipitation) (?:data|readings)[^.!?;]{0,20}(?:missing|unavailable)/i.test(text)) return false;
  // Unqualified "unavailable" overstates partial coverage. A nearby explicit
  // qualifier such as "for part of the forecast" remains valid.
  for (const clause of text.split(/[.!?;,]/)) {
    if (!/\bunavailable\b/i.test(clause) || /\b(?:some|part|partly|partial|partially|incomplete|limited)\b/i.test(clause)) continue;
    if (missingTemperature && temperatures.size > 0 && /\btemperature/i.test(clause)) return false;
    if (missingPrecipitation && probabilities.size > 0 && /\b(?:rain|precipitation)\b/i.test(clause)) return false;
  }
  const known = forecast.hourly.filter(hour => hour.time < now / 1000 + 24 * HOUR && hour.time + HOUR > now / 1000)
    .flatMap(hour => hour.temperature === null ? [] : [hour.temperature]);
  if (known.length && Math.max(...known) - Math.min(...known) < 2 && /\b(?:cooling|warming|warm up|cool down|warms up|cools down)\b/i.test(text)) return false;
  return true;
}
