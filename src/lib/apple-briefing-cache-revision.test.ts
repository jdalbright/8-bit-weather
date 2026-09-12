import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => { vi.resetModules(); return new Map<string, string>(); });
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
vi.mock('./native', () => ({ isNativeApp: () => true, isAppActive: () => true }));
vi.mock('./persistence', () => ({
  readStoredValue: (key: string) => storage.get(key) ?? null,
  writeStoredValue: (key: string, value: string) => { storage.set(key, value); return true; },
  removeStoredValue: (key: string) => { storage.delete(key); },
}));
import { APPLE_BRIEFING_REVISION } from './apple-briefing';
import { BRIEFING_STORAGE, BRIEFING_TTL, BRIEFING_VERSION, type WeatherBriefing } from './briefing';
import { cachedBriefing, clearBriefingCache } from './briefing-client';
import { fixtureTime } from '../test/fixtures';
function briefing(provider: 'apple' | 'openai', applePromptRevision?: number): WeatherBriefing {
  return { text: 'Temperatures stay mild today. Precipitation chances stay low.', provider,
    ...(provider === 'apple' ? { appleModelOSMajor: 27, applePromptRevision } : {}),
    generatedAt: fixtureTime, windowStart: fixtureTime, windowEnd: fixtureTime + 86400000,
    expiresAt: fixtureTime + BRIEFING_TTL, version: BRIEFING_VERSION };
}
beforeEach(() => { clearBriefingCache(); storage.clear(); });
for (const offline of [false, true]) {
  it.each([undefined, 0, APPLE_BRIEFING_REVISION - 1])(`rejects legacy Apple revision %s while preserving OpenAI (offline=${offline})`, revision => {
    const apple = briefing('apple', revision), openai = briefing('openai');
    storage.set(BRIEFING_STORAGE, JSON.stringify([
      { key: 'key', scope: 'scope', briefing: apple }, { key: 'key', scope: 'scope', briefing: openai },
    ]));
    expect(cachedBriefing('key', 'scope', fixtureTime + 1000, offline, 'apple')).toBeNull();
    expect(cachedBriefing('key', 'scope', fixtureTime + 1000, offline, 'openai')).toEqual(openai);
  });
  it(`retains current Apple revision (offline=${offline})`, () => {
    const apple = briefing('apple', APPLE_BRIEFING_REVISION);
    storage.set(BRIEFING_STORAGE, JSON.stringify([{ key: 'key', scope: 'scope', briefing: apple }]));
    expect(cachedBriefing('key', 'scope', fixtureTime + 1000, offline, 'apple')).toEqual(apple);
  });
  it(`rejects unsupported future Apple revision (offline=${offline})`, () => {
    storage.set(BRIEFING_STORAGE, JSON.stringify([{ key: 'key', scope: 'scope', briefing: briefing('apple', APPLE_BRIEFING_REVISION + 1) }]));
    expect(cachedBriefing('key', 'scope', fixtureTime + 1000, offline, 'apple')).toBeNull();
  });
}
it('keeps the current Apple offline saved-window behavior after ordinary expiry', () => {
  const apple = briefing('apple', APPLE_BRIEFING_REVISION);
  storage.set(BRIEFING_STORAGE, JSON.stringify([{ key: 'key', scope: 'scope', briefing: apple }]));
  expect(cachedBriefing('key', 'scope', fixtureTime + BRIEFING_TTL + 1, false, 'apple')).toBeNull();
  expect(cachedBriefing('key', 'scope', fixtureTime + BRIEFING_TTL + 1, true, 'apple')).toEqual(apple);
  expect(cachedBriefing('key', 'scope', fixtureTime + 86400000, true, 'apple')).toBeNull();
});
