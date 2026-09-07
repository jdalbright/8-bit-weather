import type { Preferences, SceneState } from '../types';
import { compositions, frequency, moodFor } from './compositions';
import type { Mood } from './compositions';

type Track = { mood: Mood; gain: GainNode; step: number; next: number; retireAt: number | null };
export class WeatherAudio {
  readonly context: AudioContext;
  private master: GainNode;
  private music: GainNode;
  private ambience: GainNode;
  private effects: GainNode;
  private atmosphere: BiquadFilterNode;
  private atmosphereGain: GainNode;
  private tracks: Track[] = [];
  private timer: number | null = null;
  private scene: SceneState = { kind: 'clear', isDay: true, wind: 0 };
  private preferences: Preferences;
  private enabled = false;
  private activity = 0;
  private lastAmbient = 0;
  private voices = new Set<AudioScheduledSourceNode>();

  constructor(preferences: Preferences, onState: () => void) {
    const Audio = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) throw new Error('Audio isn’t available in this browser. The forecast still works.');
    this.context = new Audio();
    this.context.onstatechange = onState;
    this.preferences = preferences;
    this.master = this.context.createGain(); this.master.gain.value = 0;
    const limiter = this.context.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 8;
    this.master.connect(limiter); limiter.connect(this.context.destination);
    this.music = this.context.createGain(); this.ambience = this.context.createGain(); this.effects = this.context.createGain();
    this.music.connect(this.master); this.ambience.connect(this.master); this.effects.connect(this.master);
    const noise = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 48271;
    for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }
    const source = this.context.createBufferSource(); source.buffer = noise; source.loop = true;
    this.atmosphere = this.context.createBiquadFilter(); this.atmosphere.type = 'lowpass';
    this.atmosphereGain = this.context.createGain();
    this.atmosphereGain.gain.value = 0;
    source.connect(this.atmosphere); this.atmosphere.connect(this.atmosphereGain); this.atmosphereGain.connect(this.ambience); source.start();
    this.voices.add(source);
    this.configure(preferences, this.scene);
  }
  private ramp(param: AudioParam, value: number, seconds = 0.12) {
    const time = this.context.currentTime;
    param.cancelScheduledValues(time); param.setValueAtTime(param.value, time); param.linearRampToValueAtTime(value, time + seconds);
  }
  configure(preferences: Preferences, scene: SceneState) {
    this.preferences = preferences; this.scene = scene;
    this.ramp(this.music.gain, preferences.music ? preferences.musicVolume * 0.42 : 0);
    this.ramp(this.ambience.gain, preferences.ambience ? preferences.ambienceVolume * 0.32 : 0);
    this.ramp(this.effects.gain, preferences.effects ? preferences.effectsVolume * 0.32 : 0);
    const wet = scene.kind === 'rain' || scene.kind === 'storm';
    this.ramp(this.atmosphere.frequency, wet ? 4200 : scene.kind === 'snow' ? 340 : 650, 1.5);
    this.ramp(this.atmosphereGain.gain, wet ? 0.45 : scene.kind === 'snow' ? 0.12 : 0.1 + Math.min(scene.wind, 40) / 180, 1.5);
    const mood = moodFor(scene);
    if (this.tracks.at(-1)?.mood !== mood) {
      const time = this.context.currentTime;
      for (const track of this.tracks) { this.ramp(track.gain.gain, 0, 1.8); track.retireAt = time + 2.5; }
      const gain = this.context.createGain(); gain.gain.value = 0; gain.connect(this.music);
      this.ramp(gain.gain, 1, 1.8);
      this.tracks.push({ mood, gain, step: 0, next: time + 0.06, retireAt: null });
    }
  }
  async start() {
    this.activity++;
    this.enabled = true;
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Tap Sound again to enable audio in this browser.');
    this.ramp(this.master.gain, 0.7, 0.3);
    for (const track of this.tracks) track.next = this.context.currentTime + 0.06;
    if (this.timer === null) this.timer = window.setInterval(() => this.schedule(), 40);
  }
  async pause() {
    const activity = ++this.activity;
    this.enabled = false;
    this.ramp(this.master.gain, 0, 0.06);
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    // Let the short fade finish, but never suspend a newer tap-to-resume request.
    await new Promise(resolve => window.setTimeout(resolve, 75));
    if (activity === this.activity && !this.enabled && this.context.state !== 'closed') await this.context.suspend();
  }
  private note(midi: number, time: number, duration: number, destination: AudioNode, wave: OscillatorType, level: number) {
    if (!midi) return;
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain();
    oscillator.type = wave; oscillator.frequency.value = frequency(midi);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(level, time + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(envelope); envelope.connect(destination);
    oscillator.start(time); oscillator.stop(time + duration + 0.02);
    this.voices.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.voices.delete(oscillator); };
  }
  private schedule() {
    if (!this.enabled || this.context.state !== 'running') return;
    const time = this.context.currentTime;
    this.tracks = this.tracks.filter(track => {
      if (track.retireAt !== null && track.retireAt < time) { track.gain.disconnect(); return false; }
      if (track.retireAt !== null) return true;
      const score = compositions[track.mood], stepLength = 60 / score.bpm / 2;
      if (track.next < time - 0.2) track.next = time + 0.03;
      while (track.next < time + 0.15) {
        if (this.preferences.music) {
          const root = score.roots[Math.floor(track.step / 8) % 4];
          this.note(score.melody[track.step % 32], track.next, stepLength * 1.5, track.gain, score.wave, 0.28);
          if (track.step % 4 === 0) this.note(root, track.next, stepLength * 3, track.gain, 'triangle', 0.23);
          if (track.step % 2 === 1) this.note(root + (track.step % 4 === 1 ? 12 : 19), track.next, stepLength * 0.7, track.gain, 'square', 0.035);
        }
        track.step++; track.next += stepLength;
      }
      return true;
    });
    if (this.preferences.ambience && time - this.lastAmbient > 8) {
      this.lastAmbient = time;
      if (this.scene.kind === 'storm') {
        this.note(26, time + 0.02, 2.8, this.ambience, 'triangle', 0.15);
        this.note(33, time + 0.16, 2.3, this.ambience, 'sine', 0.1);
      } else if (this.scene.kind === 'rain') {
        this.note(92, time + 0.02, 0.15, this.ambience, 'sine', 0.12);
        this.note(87, time + 0.27, 0.2, this.ambience, 'sine', 0.1);
      } else if (this.scene.isDay && (this.scene.kind === 'clear' || this.scene.kind === 'partly-cloudy')) {
        [91, 96, 94].forEach((midi, index) => this.note(midi, time + 0.02 + index * 0.12, 0.15, this.ambience, 'sine', 0.09));
      } else if (!this.scene.isDay) {
        [0, 0.13, 0.26].forEach(delay => this.note(102, time + 0.02 + delay, 0.055, this.ambience, 'sine', 0.035));
      }
    }
  }
  effect(type: 'tap' | 'success' | 'remove' = 'tap') {
    if (!this.enabled || !this.preferences.effects || this.context.state !== 'running') return;
    const notes = type === 'success' ? [72, 76, 79] : type === 'remove' ? [76, 69] : [84];
    notes.forEach((midi, index) => this.note(midi, this.context.currentTime + 0.01 + index * 0.055, 0.1, this.effects, 'square', 0.09));
  }
  async dispose() {
    this.activity++;
    if (this.timer !== null) clearInterval(this.timer);
    for (const voice of this.voices) { try { voice.stop(); } catch { /* Already finished. */ } }
    this.voices.clear(); this.context.onstatechange = null;
    if (this.context.state !== 'closed') await this.context.close();
  }
}
