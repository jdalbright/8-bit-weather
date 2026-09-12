import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { briefingFacts, forecastUsable, HOUR, type BriefingForecast } from '../src/lib/briefing';
import { THUNDERSTORM_TAKEAWAY } from '../src/lib/briefing-prompt';
import { comparisonForecast, comparisonScenarios, comparisonTime } from './briefing-scenarios.fixture';
import { openAIBriefingFacts, validOpenAISummary } from './openai-briefing';

it('distinguishes no precipitation expected from missing precipitation data', () => {
  const forecast = comparisonForecast('steady');
  forecast.hourly.forEach(hour => { hour.precipitation = 0; });
  const dry = 'Temperatures stay near 72°F. No precipitation is expected.';
  expect(validOpenAISummary(dry, forecast, comparisonTime)).toBe(true);
  expect(validOpenAISummary('Temperatures stay near 72°F. There is no precipitation data.', forecast, comparisonTime)).toBe(false);
  expect(validOpenAISummary('No temperatures are available. No precipitation is expected.', forecast, comparisonTime)).toBe(false);
  forecast.hourly[1].precipitation = null;
  expect(validOpenAISummary(dry, forecast, comparisonTime)).toBe(false);
  expect(validOpenAISummary('Temperatures stay near 72°F. Precipitation data is incomplete, with available chances peaking at 0%.', forecast, comparisonTime)).toBe(true);
});

it('uses one temperature for steady weather with the selected units', () => {
  const forecast = comparisonForecast('steady');
  expect(openAIBriefingFacts(forecast, comparisonTime).temperature).toEqual({ pattern: 'steady', steadyAt: '72°F', timeline: [] });
  expect(openAIBriefingFacts({ ...forecast, units: 'metric' }, comparisonTime).temperature.steadyAt).toBe('22°C');
});

it('keeps chronological cooling and the rebound after the overnight low', () => {
  const facts = openAIBriefingFacts(comparisonForecast('overnight-cooling'), comparisonTime);
  expect(facts.temperature.timeline).toEqual([
    { temperature: '79°F', period: 'this afternoon' },
    { temperature: '52°F', period: 'overnight' },
    { temperature: '66°F', period: 'tomorrow afternoon' },
  ]);
  expect(openAIBriefingFacts(comparisonForecast('warming'), comparisonTime).temperature.timeline).toEqual([
    { temperature: '41°F', period: 'this afternoon' },
    { temperature: '84°F', period: 'tomorrow afternoon' },
  ]);
});

it('groups low chances and does not leak the preceding or trailing interval', () => {
  const forecast = comparisonForecast('low-chances');
  forecast.hourly[0].precipitation = 99;
  forecast.hourly[25].precipitation = 20;
  const facts = openAIBriefingFacts(forecast, comparisonTime);
  expect(facts.precipitation.pattern).toBe('low-chances');
  expect(facts.precipitation.peakChancePercent).toBe(20);
  expect(facts.precipitation.periods).toEqual([]);
  expect(facts.precipitation.peakPeriods).toEqual([]);
  // At an exact hour the 25th endpoint is outside the window.
  forecast.hourly[25].precipitation = 99;
  expect(openAIBriefingFacts(forecast, comparisonTime - 1800000).precipitation.peakChancePercent).toBe(20);
  expect(openAIBriefingFacts(forecast, comparisonTime).precipitation.peakChancePercent).toBe(99);
});

it('selects useful leads and preserves condition transitions and freezing distinctions', () => {
  const rain = openAIBriefingFacts(comparisonForecast('showers'), comparisonTime);
  expect(rain.lead).toBe('precipitation-timing');
  expect(rain.precipitation.peakPeriods).toEqual(['this evening']);
  expect(rain.conditions.map(run => run.kind)).toEqual(['cloudy', 'rain', 'cloudy']);
  expect(rain.conditions[1]).toMatchObject({ from: 'this evening', through: 'this evening' });
  for (const scenario of ['snow', 'thunderstorms'] as const) {
    expect(openAIBriefingFacts(comparisonForecast(scenario), comparisonTime).lead).toBe('snow-or-thunderstorms');
  }
  const freezing = comparisonForecast('showers'); freezing.hourly[6].code = 66;
  expect(openAIBriefingFacts(freezing, comparisonTime).conditions.some(run => run.condition === 'Freezing rain')).toBe(true);
});

it('keeps partial and fully unavailable coverage distinct for each measurement', () => {
  const forecast = comparisonForecast('incomplete');
  const facts = openAIBriefingFacts(forecast, comparisonTime);
  for (const measurement of ['temperature', 'precipitation', 'conditions'] as const) {
    expect(facts.coverage[measurement]).toEqual({ status: 'partial', missingIntervals: 1 });
  }
  forecast.hourly.forEach(hour => { hour.precipitation = null; hour.temperature = null; });
  const unknown = openAIBriefingFacts(forecast, comparisonTime);
  expect(unknown.coverage.temperature.status).toBe('unavailable');
  expect(unknown.coverage.precipitation.status).toBe('unavailable');
  expect(unknown.temperature.timeline).toEqual([]);
  expect(unknown.precipitation.peakChancePercent).toBeNull();
});

describe.each(['2026-03-08T06:30:00Z', '2026-11-01T05:30:00Z', '2026-09-12T03:30:00Z'])('local dayparts at %s', iso => {
  it('covers 24 elapsed hours across DST and midnight without losing measurements', () => {
    const now = Date.parse(iso), forecast = comparisonForecast('showers', now);
    const facts = openAIBriefingFacts(forecast, now);
    expect(forecastUsable(forecast, now)).toBe(true);
    expect(briefingFacts(forecast, now).hours).toHaveLength(25);
    expect(facts.from).toBe(briefingFacts(forecast, now).from);
    expect(facts.until).toBe(briefingFacts(forecast, now).until);
    expect(facts.coverage.precipitation.status).toBe('complete');
    expect(facts.precipitation.periods[0].period).toBe(iso.includes('09-12') ? 'this evening' : 'early this morning');
    expect(facts.precipitation.periods.at(-1)?.period).toBe(iso.includes('09-12') ? 'tomorrow evening' : 'overnight');
    if (iso.includes('11-01')) expect(facts.precipitation.periods.filter(period => period.period === 'early this morning')).toHaveLength(1);
  });
});

it('labels a clipped first interval using the actual local day at half-hour offsets', () => {
  const now = Date.parse('2026-09-11T18:40:00Z');
  const forecast = comparisonForecast('showers', now); forecast.timezone = 'Asia/Kolkata';
  expect(openAIBriefingFacts(forecast, now).precipitation.periods[0].period).toBe('early this morning');
});

it.each(comparisonScenarios)('prepares usable, private, reproducible evaluation input: %s', scenario => {
  const forecast = comparisonForecast(scenario);
  expect(forecastUsable(forecast, comparisonTime)).toBe(true);
  expect(forecast.hourly.at(-1)!.time - forecast.hourly[0].time).toBe(25 * HOUR);
  expect(JSON.stringify(openAIBriefingFacts(forecast, comparisonTime))).not.toMatch(/latitude|longitude|placeId|Asheville/);
});

it.each([
  'Temperatures stay near 99°F. Rain chances remain low at 0%.',
  'Temperatures stay near 72°F. Rain chances reach 15 percent.',
  'Temperatures range from 60–72°F. Rain chances remain low.',
  'Temperatures stay near 72°C. Rain chances remain low.',
  'Temperatures stay near 72 degrees Celsius. Rain chances remain low.',
  'Temperatures stay near 72°F. Rain chances range from 0 to 20%.',
  'Temperatures stay near 72°F. Rain data is missing.',
  'Temperatures stay near 72°F. Precipitation coverage is incomplete.',
  'Temperature readings are unavailable. Rain chances remain low.',
  'Expect cooling overnight from 72°F. Rain chances remain low.',
])('rejects unsupported numbers, coverage and trends: %s', text => {
  expect(validOpenAISummary(text, comparisonForecast('steady'), comparisonTime)).toBe(false);
});

it.each([
  'Available temperatures stay near 72°F. Rain data is incomplete, but expect dry weather.',
  'Available temperatures stay near 72°F. Rain data is incomplete, with no chance of rain.',
  'Available temperatures stay near 72°F. There is no rain data.',
  'Temperatures stay near 72°F. Rain chances are low.',
  'Available temperatures stay near 72°F. Rain chances remain low.',
  'All temperature data is missing. Rain data is incomplete.',
  'Available temperatures stay near 72°F. Rain data is unavailable.',
])('rejects incomplete-data overclaims: %s', text => {
  expect(validOpenAISummary(text, comparisonForecast('incomplete'), comparisonTime)).toBe(false);
});

it('accepts natural supported summaries, partial qualifiers, zeroes and negative temperatures', () => {
  expect(validOpenAISummary('Temperatures stay near 72°F through tomorrow afternoon. Rain chances remain low at 0%.', comparisonForecast('steady'), comparisonTime)).toBe(true);
  expect(validOpenAISummary('Available temperature readings stay near 72°F. Rain data is incomplete, so the precipitation outlook is uncertain.', comparisonForecast('incomplete'), comparisonTime)).toBe(true);
  const snow = comparisonForecast('snow'); snow.units = 'metric';
  expect(validOpenAISummary('Snow is forecast this evening, with precipitation chances reaching 80%. Temperatures dip from −1°C to −4°C overnight.', snow, comparisonTime)).toBe(true);
  expect(validOpenAISummary('Snow is forecast this evening, with precipitation chances reaching 80%. Temperatures range from -4 to -1°C.', snow, comparisonTime)).toBe(true);
});

it('allows unavailable wording only when the whole measurement is missing', () => {
  const forecast = comparisonForecast('steady');
  forecast.hourly.forEach(hour => { hour.temperature = null; hour.precipitation = null; });
  expect(validOpenAISummary('Temperature data is unavailable. Precipitation data is also unavailable.', forecast, comparisonTime)).toBe(true);
  expect(validOpenAISummary('Available temperatures look mild. Precipitation data is unavailable.', forecast, comparisonTime)).toBe(false);
  expect(validOpenAISummary('Available temperatures stay near 72°F. Rain data is unavailable for part of the forecast.', comparisonForecast('incomplete'), comparisonTime)).toBe(true);
});

it('does not attribute one measurement’s missing-data statement to the other', () => {
  const rainMissing = comparisonForecast('steady'); rainMissing.hourly[1].precipitation = null;
  expect(validOpenAISummary('Temperatures stay near 72°F, but rain data is incomplete. Clear skies are in the forecast.', rainMissing, comparisonTime)).toBe(true);
  expect(validOpenAISummary('Temperatures stay near 72°F and precipitation data is incomplete. Clear skies are in the forecast.', rainMissing, comparisonTime)).toBe(true);
  const temperatureMissing = comparisonForecast('steady'); temperatureMissing.hourly[1].temperature = null;
  expect(validOpenAISummary('Available temperatures stay near 72°F. Some temperature readings are missing and rain chances stay low.', temperatureMissing, comparisonTime)).toBe(true);
});

it.each([0, 10, 20])('gives consistently low %i%% chances a single peak without repetitive dayparts', peak => {
  const forecast = comparisonForecast('low-chances'); forecast.hourly.forEach(hour => { hour.precipitation = peak; });
  const facts = openAIBriefingFacts(forecast, comparisonTime);
  expect(facts.precipitation).toEqual({ peakChancePercent: peak, pattern: 'low-chances', peakPeriods: [], periods: [], missingPeriods: [] });
  expect(facts.thunderstormTakeaway).toBeNull();
});

it('retains missing-data timing and meaningful peaks at the low-chance boundary', () => {
  const forecast = comparisonForecast('incomplete');
  const facts = openAIBriefingFacts(forecast, comparisonTime);
  expect(facts.precipitation.periods).toEqual([]);
  expect(facts.precipitation.peakPeriods).toEqual([]);
  expect(facts.precipitation.missingPeriods).toEqual(['this evening']);
  expect(facts.coverage.precipitation).toEqual({ status: 'partial', missingIntervals: 1 });
  forecast.hourly[6].precipitation = 21;
  expect(openAIBriefingFacts(forecast, comparisonTime).precipitation).toMatchObject({
    pattern: 'highlight-peak-periods', peakPeriods: ['this evening'], missingPeriods: ['this evening'],
  });
});

it.each([95, 96, 99])('supplies conditional shelter guidance for thunderstorm code %i even with low rain chances', code => {
  const forecast = comparisonForecast('low-chances'); forecast.hourly[4].code = code;
  const facts = openAIBriefingFacts(forecast, comparisonTime);
  expect(facts.thunderstormTakeaway).toBe(THUNDERSTORM_TAKEAWAY);
  expect(facts.lead).toBe('snow-or-thunderstorms');
  expect(facts.conditions.some(run => run.kind === 'storm' && run.from === 'this evening')).toBe(true);
  expect(facts.precipitation.peakPeriods).toEqual([]);
});

it.each(['an umbrella', 'a raincoat', 'a poncho', 'rain gear', 'rainwear'])('rejects advice to carry %s when thunderstorms are forecast', gear => {
  expect(validOpenAISummary(`Thunderstorms are possible this evening, with precipitation chances reaching 80%. Carry ${gear} or seek shelter if storms develop.`, comparisonForecast('thunderstorms'), comparisonTime)).toBe(false);
});

it('preserves ordinary shower advice and accepts storm summaries with or without the conditional takeaway', () => {
  const umbrella = 'Showers are most likely this evening, with precipitation chances reaching 80%. Carry an umbrella for evening showers.';
  expect(validOpenAISummary(umbrella, comparisonForecast('showers'), comparisonTime)).toBe(true);
  const weather = 'Thunderstorms are possible this evening, with precipitation chances reaching 80%. Temperatures fall from 77°F to 66°F by tomorrow afternoon.';
  expect(validOpenAISummary(weather, comparisonForecast('thunderstorms'), comparisonTime)).toBe(true);
  expect(validOpenAISummary(`${weather} ${THUNDERSTORM_TAKEAWAY}`, comparisonForecast('thunderstorms'), comparisonTime)).toBe(true);
});

it('does not apply storm advice restrictions to storms outside the forecast window', () => {
  const forecast = comparisonForecast('showers');
  forecast.hourly[25].code = 95;
  const text = 'Showers are most likely this evening, with precipitation chances reaching 80%. Carry an umbrella for evening showers.';
  expect(openAIBriefingFacts(forecast, comparisonTime).thunderstormTakeaway).toBeNull();
  expect(validOpenAISummary(text, forecast, comparisonTime)).toBe(true);
});

// Replay recorded real-model output without spending tokens or rewriting evidence.
const recorded = JSON.parse(readFileSync(new URL('../docs/evidence/openai-briefing/2026-09-11-comparison.json', import.meta.url), 'utf8')) as {
  comparisonTime: number; samples: { scenario: string; forecast: BriefingForecast; outputs: { candidate: { text: string } } }[];
};

const rejected = JSON.parse(readFileSync(new URL('../docs/evidence/openai-briefing/2026-09-11-xweather-rejection.json', import.meta.url), 'utf8')) as {
  now: number; forecast: BriefingForecast; samples: { text: string }[];
};
it('accepts the complete observed four-sentence Xweather summary with its recommendation', () => {
  const text = rejected.samples[0].text;
  expect(text).toContain(THUNDERSTORM_TAKEAWAY);
  expect(validOpenAISummary(text, rejected.forecast, rejected.now)).toBe(true);
  expect(validOpenAISummary(text.replace('100%', '99%'), rejected.forecast, rejected.now)).toBe(false);
  expect(validOpenAISummary(text.replace('though the data is incomplete', 'dry weather is expected'), rejected.forecast, rejected.now)).toBe(false);
});
it('keeps comma-separated missing-data claims scoped to their own measurement', () => {
  const forecast = comparisonForecast('steady');
  forecast.hourly[1].precipitation = null;
  expect(validOpenAISummary('Temperatures stay near 72°F. Available precipitation data shows 0%, though the data is incomplete.', forecast, comparisonTime)).toBe(true);
  expect(validOpenAISummary('Rain chances reach 0%, but temperature data is incomplete. Temperatures stay near 72°F.', forecast, comparisonTime)).toBe(false);
  expect(validOpenAISummary('Precipitation data shows 0%. The data is incomplete, with temperatures near 72°F.', forecast, comparisonTime)).toBe(false);
});
it('allows recommendations while retaining storm advice checks', () => {
  const forecast = comparisonForecast('thunderstorms');
  const weather = 'Thunderstorms are possible this evening, with precipitation chances reaching 80%. Temperatures fall from 77°F to 66°F by tomorrow afternoon.';
  const valid = `${weather} ${THUNDERSTORM_TAKEAWAY}`;
  expect(validOpenAISummary(valid, forecast, comparisonTime)).toBe(true);
  expect(validOpenAISummary(`${weather} Carry an umbrella. Seek shelter.`, forecast, comparisonTime)).toBe(false);
});
it.each(recorded.samples)('replays the recorded $scenario output through the revised validator', sample => {
  expect(validOpenAISummary(sample.outputs.candidate.text, sample.forecast, recorded.comparisonTime)).toBe(sample.scenario !== 'thunderstorms');
  if (sample.scenario === 'low-chances') {
    const facts = openAIBriefingFacts(sample.forecast, recorded.comparisonTime);
    expect(facts.precipitation.peakPeriods).toEqual([]);
    expect(facts.precipitation.periods).toEqual([]);
  }
});
