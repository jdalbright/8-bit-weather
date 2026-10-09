import { expect, it } from 'vitest';
import { migrationCases, migrationVariants } from './weather-migration.fixture';

it('isolates model and prompt changes while holding facts and request settings fixed', () => {
  const cases = migrationCases();
  expect(cases).toHaveLength(14);
  for (const sample of cases) {
    const [baseline, modelOnly, revised] = migrationVariants.map(variant => sample.request(variant));
    expect(modelOnly).toEqual({ ...baseline, model: 'gpt-6-luna' });
    expect(revised).toEqual({ ...modelOnly, instructions: revised.instructions });
    expect(revised.instructions).not.toBe(modelOnly.instructions);
    expect(revised).toMatchObject({ reasoning: { effort: 'none' }, store: false,
      max_output_tokens: sample.kind === 'briefing' ? 1000 : 350 });
  }
});

it('evaluates eligible outdoor choices with the production validator, including ties and heat', () => {
  for (const sample of migrationCases().filter(sample => sample.kind === 'outdoor')) {
    expect(sample.accepted(JSON.stringify({ start: sample.expectedStart,
      text: 'The light wind is a plus, though the heat remains a drawback.' }))).toBe(true);
    expect(sample.accepted(JSON.stringify({ start: sample.expectedStart, text: 'Guaranteed safe weather.' }))).toBe(false);
    expect(sample.accepted(JSON.stringify({ start: 0, text: 'Light wind.' }))).toBe(false);
    expect(sample.accepted('invalid JSON')).toBe(false);
  }
});

it('requires separately qualified unavailable measurements under the existing output contract', () => {
  const sample = migrationCases().find(sample => sample.name === 'measurements-unavailable')!;
  expect(sample.accepted('Clear or mostly clear skies are expected through tomorrow afternoon. Temperature and precipitation data are unavailable.')).toBe(false);
  expect(sample.accepted('Clear or mostly clear skies are expected through tomorrow afternoon. Temperature data is unavailable. Precipitation data is unavailable.')).toBe(true);
});

it('accepts qualified zero-percent partial coverage without allowing no-chance claims', () => {
  for (const name of ['incomplete', 'metric-incomplete']) {
    const sample = migrationCases().find(sample => sample.name === name)!;
    const temperature = name === 'incomplete' ? '72°F' : '22°C';
    const prefix = `Available temperature readings stay near ${temperature}. `;
    expect(sample.accepted(prefix + 'Available readings show a peak hourly precipitation chance of 0%, but precipitation data is incomplete.')).toBe(true);
    expect(sample.accepted(prefix + 'Available precipitation readings show no chance, but precipitation data is incomplete.')).toBe(false);
  }
});
