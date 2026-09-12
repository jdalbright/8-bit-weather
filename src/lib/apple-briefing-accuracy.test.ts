import { describe, expect, it } from 'vitest';
import { appleBriefingFacts, validAppleSummary } from './apple-briefing';
import { appleBriefingInstructions } from './briefing-prompt';
import { validBriefingClaims, type BriefingForecast } from './briefing';

const now = Date.parse('2026-09-12T12:30:00Z');
function forecast(time = now, timezone = 'UTC'): BriefingForecast {
  const start = Math.floor(time / 3600000) * 3600;
  return {
    timezone, fetchedAt: time, observationTime: time / 1000, units: 'imperial',
    hourly: Array.from({ length: 26 }, (_, index) => ({
      time: start + index * 3600, temperature: 22.2, precipitation: 80, code: 73, isDay: true,
    })),
  };
}
function summary(input: BriefingForecast, first = 'Temperatures stay near 72°F.', time = now): string {
  return `${first} ${JSON.parse(appleBriefingFacts(input, time)).precipitation.statement}`;
}

describe('Apple compact briefing accuracy', () => {
  it.each([63, 73, 95, 100, 101, 102, null])('uses generic precipitation language for condition %s', code => {
    const input = forecast();
    input.hourly.forEach(hour => { hour.code = code; hour.precipitation = 10; });
    // Compact facts do not carry the condition type, so they cannot call POP rain.
    expect(appleBriefingFacts(input, now)).not.toMatch(/\brain\b/i);
    expect(appleBriefingInstructions).not.toContain('Start the second sentence with "Rain chances"');
    expect(appleBriefingInstructions).toMatch(/precipitation/i);
  });

  it('accepts generic precipitation wording and rejects a rain claim for a snow forecast', () => {
    const input = forecast();
    expect(validAppleSummary(summary(input), input, now)).toBe(true);
    expect(validAppleSummary('Temperatures stay near 72°F. Rain chances peak at 80%.', input, now)).toBe(false);
    expect(validAppleSummary(summary(input, 'Temperatures stay near 72°F with rain.'), input, now)).toBe(false);
  });

  it('does not turn partial zero probabilities into a whole-window dry forecast', () => {
    const input = forecast();
    input.hourly.forEach(hour => { hour.precipitation = 0; });
    input.hourly[1].precipitation = null;
    const facts = JSON.parse(appleBriefingFacts(input, now));
    expect(facts.missingPrecipitationHours).toBe(1);
    expect(facts.coverage.precipitation).toBe('partial');
    expect(facts.precipitation.statement).toBe('Precipitation data is incomplete; available hourly chances peak at 0%.');
    expect(validAppleSummary('Available temperatures stay near 72°F. Precipitation chances peak at 0%.', input, now)).toBe(false);
    expect(validAppleSummary(summary(input), input, now)).toBe(true);
  });

  it('distinguishes expected absence of precipitation from missing precipitation data', () => {
    const input = forecast();
    input.hourly.forEach(hour => { hour.precipitation = 0; });
    expect(JSON.parse(appleBriefingFacts(input, now)).precipitation.statement).toBe('Precipitation is not expected.');
    expect(validAppleSummary(summary(input), input, now)).toBe(true);
    // The shared claims check still distinguishes an absence of weather from absent data.
    expect(validBriefingClaims('Temperatures stay near 72°F. No precipitation is expected.', input, now)).toBe(true);
    expect(validBriefingClaims('Temperatures stay near 72°F. No precipitation data is available.', input, now)).toBe(false);
    expect(validAppleSummary('Temperatures stay near 72°F. No precipitation data is available.', input, now)).toBe(false);
    expect(validAppleSummary(summary(input, 'No temperatures are available.'), input, now)).toBe(false);

    input.hourly[1].precipitation = null;
    expect(validBriefingClaims('Temperatures stay near 72°F. No precipitation is expected.', input, now)).toBe(false);
    expect(validAppleSummary('Temperatures stay near 72°F. No precipitation is expected.', input, now)).toBe(false);
    expect(validAppleSummary('Temperatures stay near 72°F. Precipitation data is incomplete, but no precipitation is expected.', input, now)).toBe(false);
    expect(validAppleSummary(summary(input), input, now)).toBe(true);
  });

  it('requires separate coverage qualifications for missing temperature and precipitation', () => {
    const input = forecast();
    input.hourly[0].temperature = null;
    input.hourly[1].precipitation = null;
    expect(validAppleSummary('Available temperatures stay near 72°F. Precipitation chances peak at 80%.', input, now)).toBe(false);
    expect(validAppleSummary(summary(input), input, now)).toBe(false);
    expect(validAppleSummary(summary(input, 'Available temperature readings stay near 72°F.'), input, now)).toBe(true);
  });

  it('distinguishes completely unavailable measurements from partial coverage', () => {
    const input = forecast();
    input.hourly.forEach(hour => { hour.temperature = null; hour.precipitation = null; });
    const facts = JSON.parse(appleBriefingFacts(input, now));
    expect(facts.coverage).toEqual({ temperature: 'unavailable', precipitation: 'unavailable' });
    expect(facts.precipitation.statement).toBe('Precipitation data is unavailable.');
    expect(validAppleSummary(summary(input, 'Available temperature readings stay mild.'), input, now)).toBe(false);
    expect(validAppleSummary(summary(input, 'Temperature data is unavailable.'), input, now)).toBe(true);
  });

  it.each([
    'Temperatures stay near 72°F. Precipitation chances range from 10–80%.',
    'Temperatures stay near 10–72°F. Precipitation chances peak at 80%.',
    'Temperatures stay near 72°C. Precipitation chances peak at 80%.',
    'Temperatures stay near 72 degrees Celsius. Precipitation chances peak at 80%.',
  ])('rejects an unsupported endpoint or explicit temperature unit: %s', text => {
    // Check the numeric guard directly so a non-copied statement cannot mask its failure.
    expect(validBriefingClaims(text, forecast(), now)).toBe(false);
    expect(validAppleSummary(text, forecast(), now)).toBe(false);
  });

  it('validates supported range endpoints but requires Apple to copy the calculated statement', () => {
    const input = forecast();
    input.hourly[2].precipitation = 10;
    const range = 'Temperatures stay near 72°F. Precipitation chances range from 10–80%.';
    expect(validBriefingClaims(range, input, now)).toBe(true);
    expect(validAppleSummary(range, input, now)).toBe(false);
    expect(validAppleSummary(summary(input), input, now)).toBe(true);
  });

  it('assigns a clipped first interval to the daypart inside the briefing window', () => {
    const time = Date.parse('2026-09-12T00:45:00Z'); // 06:15 in Kolkata; first sample is 05:30.
    const input = forecast(time, 'Asia/Kolkata');
    input.hourly.forEach(hour => { hour.precipitation = 0; });
    input.hourly[0].temperature = 30;
    input.hourly[1].precipitation = 80; // POP for the first overlapping interval.
    const facts = JSON.parse(appleBriefingFacts(input, time));
    expect(facts.temperature.high).toEqual({ value: '86°F', period: 'this morning' });
    expect(facts.precipitation.statement).toBe('Hourly precipitation chances peak at 80% this morning.');
  });
});
