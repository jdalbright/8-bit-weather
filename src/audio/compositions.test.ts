import { describe, expect, it } from 'vitest';
import { compositions, frequency, moodFor, scoreStep } from './compositions';
describe('weather soundtrack selection', () => {
  it('preserves snow and storm moods at night and uses a calm night theme otherwise', () => { expect(moodFor({kind:'storm',isDay:false})).toBe('storm'); expect(moodFor({kind:'snow',isDay:false})).toBe('snow'); expect(moodFor({kind:'rain',isDay:false})).toBe('night'); expect(moodFor({kind:'fog',isDay:true})).toBe('clouds'); });
  it('has six distinct, bounded, complete musical loops', () => {
    expect(new Set(Object.values(compositions).map(c => c.sections[0].melody.join(','))).size).toBe(6);
    for (const score of Object.values(compositions)) {
      expect(score.sections[0].melody).not.toEqual(score.sections[1].melody);
      for (const section of score.sections) {
        expect(section.melody).toHaveLength(32); expect(section.roots).toHaveLength(4);
        expect(section.melody.every(note => note === 0 || note >= 60 && note <= 96)).toBe(true);
      }
      expect(scoreStep(score, 31).section).toBe(0);
      expect(scoreStep(score, 32)).toMatchObject({ section: 1, note: score.sections[1].melody[0], root: score.sections[1].roots[0] });
      expect(scoreStep(score, 64)).toEqual(scoreStep(score, 0));
      expect(Array.from({length:128}, (_, step) => scoreStep(score,step)).every(s => Number.isFinite(s.note) && Number.isFinite(s.root))).toBe(true);
    }
    expect(frequency(69)).toBe(440);
  });
});
