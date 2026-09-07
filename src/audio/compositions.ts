import type { SceneState } from '../types';

export type Mood = 'sunshine' | 'clouds' | 'rain' | 'snow' | 'storm' | 'night';
interface Section { melody: number[]; roots: number[] }
export interface Composition { name: string; bpm: number; sections: [Section, Section]; wave: OscillatorType }
// Original call-and-answer melodies, in MIDI notes. Zero is a rest; nothing is sampled.
const themes = {
  sunshine: { name: 'Meadow morning', bpm: 84, wave: 'triangle', roots: [48, 53, 57, 55], melody: [72, 0, 76, 79, 0, 76, 74, 0, 72, 0, 69, 72, 77, 0, 76, 0, 76, 79, 81, 0, 79, 76, 74, 0, 71, 74, 79, 0, 76, 74, 72, 0] },
  clouds: { name: 'Cloud watching', bpm: 72, wave: 'triangle', roots: [50, 55, 53, 48], melody: [74, 0, 77, 0, 81, 79, 77, 0, 74, 0, 71, 74, 79, 0, 77, 0, 72, 0, 77, 81, 0, 79, 77, 0, 76, 0, 74, 72, 0, 67, 72, 0] },
  rain: { name: 'Rain on the roof', bpm: 68, wave: 'triangle', roots: [45, 53, 48, 55], melody: [76, 0, 72, 0, 71, 0, 69, 0, 72, 0, 77, 0, 76, 74, 72, 0, 67, 0, 72, 0, 76, 0, 74, 0, 71, 0, 74, 0, 72, 71, 69, 0] },
  snow: { name: 'Quiet snowfall', bpm: 64, wave: 'sine', roots: [53, 48, 50, 46], melody: [81, 0, 84, 0, 79, 0, 77, 0, 76, 0, 79, 0, 84, 0, 83, 0, 81, 0, 77, 0, 74, 0, 77, 0, 77, 0, 81, 0, 79, 0, 77, 0] },
  storm: { name: 'Shelter in the pines', bpm: 66, wave: 'triangle', roots: [45, 50, 53, 52], melody: [69, 0, 72, 0, 76, 0, 72, 0, 74, 0, 77, 0, 76, 74, 72, 0, 72, 0, 69, 0, 65, 0, 69, 0, 68, 0, 71, 0, 76, 0, 71, 0] },
  night: { name: 'Fireflies after dark', bpm: 62, wave: 'sine', roots: [48, 57, 53, 55], melody: [79, 0, 76, 0, 72, 0, 76, 0, 81, 0, 79, 0, 76, 0, 72, 0, 77, 0, 81, 0, 79, 0, 77, 0, 74, 0, 71, 0, 72, 0, 0, 0] },
};
const answers: Record<Mood, Section> = {
  sunshine: { roots: [53, 48, 55, 48], melody: [77, 0, 81, 79, 77, 0, 76, 0, 72, 76, 79, 0, 84, 0, 79, 0, 83, 0, 79, 77, 74, 0, 71, 0, 72, 0, 76, 0, 79, 76, 72, 0] },
  clouds: { roots: [53, 50, 55, 48], melody: [77, 0, 81, 0, 79, 0, 77, 0, 74, 0, 77, 81, 0, 77, 74, 0, 79, 0, 77, 74, 0, 71, 74, 0, 76, 0, 79, 0, 76, 0, 72, 0] },
  rain: { roots: [53, 48, 55, 45], melody: [77, 0, 81, 0, 79, 77, 76, 0, 76, 0, 72, 0, 67, 0, 72, 0, 74, 0, 79, 0, 77, 74, 71, 0, 72, 0, 76, 0, 72, 71, 69, 0] },
  snow: { roots: [46, 53, 48, 53], melody: [82, 0, 77, 0, 74, 0, 77, 0, 81, 0, 84, 0, 81, 0, 77, 0, 79, 0, 84, 0, 83, 0, 79, 0, 81, 0, 77, 0, 72, 0, 77, 0] },
  storm: { roots: [53, 50, 52, 45], melody: [77, 0, 76, 0, 72, 0, 69, 0, 74, 0, 77, 0, 81, 77, 74, 0, 76, 0, 71, 0, 68, 0, 71, 0, 72, 0, 76, 0, 72, 0, 69, 0] },
  night: { roots: [53, 48, 55, 48], melody: [81, 0, 77, 0, 72, 0, 77, 0, 79, 0, 76, 0, 72, 0, 0, 0, 83, 0, 79, 0, 74, 0, 71, 0, 76, 0, 72, 0, 0, 0, 72, 0] },
};
export const compositions = Object.fromEntries(Object.entries(themes).map(([mood, theme]) => [mood, {
  name: theme.name, bpm: theme.bpm, wave: theme.wave,
  sections: [{ melody: theme.melody, roots: theme.roots }, answers[mood as Mood]],
}])) as Record<Mood, Composition>;

export function scoreStep(score: Composition, step: number) {
  const sectionLength = score.sections[0].melody.length;
  const sectionIndex = Math.floor(step / sectionLength) % score.sections.length;
  const section = score.sections[sectionIndex];
  const position = step % sectionLength;
  return { note: section.melody[position], root: section.roots[Math.floor(position / 8)], section: sectionIndex, position };
}

export function moodFor(scene: Pick<SceneState, 'kind' | 'isDay'>): Mood {
  if (scene.kind === 'storm') return 'storm';
  if (scene.kind === 'snow') return 'snow';
  if (!scene.isDay) return 'night';
  if (scene.kind === 'rain') return 'rain';
  if (scene.kind === 'cloudy' || scene.kind === 'fog' || scene.kind === 'partly-cloudy') return 'clouds';
  return 'sunshine';
}
export const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
