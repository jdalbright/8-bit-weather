import { describe, expect, it } from 'vitest';
import samples from '../test/apple-device-samples.json';
import { appleBriefingFacts, validAppleSummary } from './apple-briefing';
import { parseBriefingForecast } from './briefing';

// Synthetic forecasts and verbatim iPhone model outputs. These replays exercise
// production validation without invoking the model or requiring a device.
describe('recorded Apple briefing device samples', () => {
  it.each(samples)('preserves the physically tested facts for $id', sample => {
    const forecast = parseBriefingForecast(sample.forecast);
    expect(forecast).not.toBeNull();
    const facts = JSON.parse(appleBriefingFacts(forecast!, sample.now));
    expect(facts).toEqual(sample.facts);
    expect(sample.acceptedText.endsWith(facts.precipitation.statement)).toBe(true);
  });

  it.each(samples)('accepts the accurate $id device output', sample => {
    const forecast = parseBriefingForecast(sample.forecast);
    expect(forecast).not.toBeNull();
    expect(validAppleSummary(sample.acceptedText, forecast!, sample.now)).toBe(true);
  });

  it.each(samples.filter(sample => sample.rejectedText))('rejects the observed $id data contradiction', sample => {
    const forecast = parseBriefingForecast(sample.forecast);
    expect(forecast).not.toBeNull();
    expect(validAppleSummary(sample.rejectedText!, forecast!, sample.now)).toBe(false);
  });
});
