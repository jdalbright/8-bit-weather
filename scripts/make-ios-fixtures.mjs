import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import console from 'node:console';
import { normalizeWeather } from '../src/lib/weather.ts';
import { asheville, forecastFixture } from '../src/test/fixtures.ts';

// Synthetic QA data only. This script writes files; it never edits a simulator.
const output = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), 'eightbit-weather-ios-fixtures'));
const now = Date.now();
const raleigh = { id: '4487042', name: 'Raleigh', region: 'North Carolina', country: 'United States', latitude: 35.7796, longitude: -78.6382, source: 'search' };
const places = [raleigh, asheville];
const preferences = { units: 'imperial', music: true, ambience: true, effects: true, musicVolume: 0.35, ambienceVolume: 0.25, effectsVolume: 0.4, reducedMotion: false };
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
for (const state of ['fresh', 'stale', 'missing']) {
  const directory = path.join(output, state);
  await mkdir(directory, { recursive: true });
  const timestamp = state === 'stale' ? now - 90 * 60_000 : now;
  const forecasts = state === 'missing' ? [] : places.map((place, index) => {
    const raw = forecastFixture(timestamp, index === 0 ? 1 : 61, 1);
    raw.current.temperature_2m = index === 0 ? 24 : 18.3;
    return normalizeWeather(raw, place, timestamp);
  });
  const stored = { preferences, places, selected: raleigh };
  const values = {
    'CapacitorStorage.8bit-weather:v1': JSON.stringify(stored),
    'CapacitorStorage.8bit-weather:v1:forecasts': JSON.stringify(forecasts),
  };
  const widget = { version: 1, place: raleigh, units: preferences.units, weather: forecasts[0] ?? null, landscape: 'raleigh', updatedAt: now };
  await writeFile(path.join(directory, 'preferences.json'), JSON.stringify(values, null, 2) + '\n');
  await writeFile(path.join(directory, 'preferences.plist'), '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n'
    + Object.entries(values).map(([key, value]) => `<key>${xml(key)}</key><string>${xml(value)}</string>`).join('\n') + '\n</dict></plist>\n');
  await writeFile(path.join(directory, 'weather-widget-v1.json'), JSON.stringify(widget, null, 2) + '\n');
}
await writeFile(path.join(output, 'README.txt'), `SYNTHETIC QA FIXTURES — not observed weather\nGenerated ${new Date(now).toISOString()} using src/test/fixtures.ts and normalizeWeather.\nTwo saved places: Raleigh (selected) and Asheville. Units: Fahrenheit.\nFresh: Raleigh 75°F; Asheville 65°F. Stale: data aged 90 minutes. Missing: no forecast.\npreferences.plist / preferences.json contain ONLY Capacitor UserDefaults keys to merge into app.eightbitweather.app. Do not overwrite an existing real user's entire defaults domain.\nweather-widget-v1.json belongs in group.app.eightbitweather.shared; remove weather-widget-refresh-v1.json when switching fixture states.\nTerminate the app before seeding; restart it afterward to hydrate native preferences and publish the widget. A reachable provider will replace these fixtures, so use an isolated offline simulator or intercept its test network for stale/offline QA.\nDeep links: eightbitweather://place?id=4487042 and eightbitweather://place?id=4453066\nThis generator does not edit a simulator or disable network.\n`);
console.log(`Synthetic iOS fixtures written to ${output}`);
