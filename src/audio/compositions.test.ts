import { describe, expect, it } from 'vitest';
import { compositions, frequency, moodFor } from './compositions';
describe('weather soundtrack selection', () => {
  it('preserves snow and storm moods at night and uses a calm night theme otherwise', () => { expect(moodFor({kind:'storm',isDay:false,wind:8})).toBe('storm'); expect(moodFor({kind:'snow',isDay:false,wind:0})).toBe('snow'); expect(moodFor({kind:'rain',isDay:false,wind:4})).toBe('night'); expect(moodFor({kind:'fog',isDay:true,wind:0})).toBe('clouds'); });
  it('has six distinct, bounded, complete musical loops', () => {
    expect(new Set(Object.values(compositions).map(c => c.melody.join(','))).size).toBe(6);
    for (const score of Object.values(compositions)) { expect(score.melody).toHaveLength(32); expect(score.roots).toHaveLength(4); expect(score.melody.every(note => note === 0 || note >= 60 && note <= 96)).toBe(true); }
    expect(frequency(69)).toBe(440);
  });
});
