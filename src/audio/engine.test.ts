import { beforeEach, expect, it, vi } from 'vitest';
import { WeatherAudio } from './engine';
import { defaultPreferences } from '../lib/storage';

// Minimal Web Audio surface; exercise the real start/pause scheduler lifecycle.
function parameter() { return { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }; }
class AudioContextStub {
  state = 'suspended'; currentTime = 0; sampleRate = 8; destination = {}; onstatechange = null;
  resumes: (() => void)[] = [];
  resume() { return new Promise<void>(resolve => this.resumes.push(() => { this.state = 'running'; resolve(); })); }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
  createGain() { return { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }; }
  createDynamicsCompressor() { return { threshold: parameter(), knee: parameter(), ratio: parameter(), connect: vi.fn() }; }
  createBuffer() { return { getChannelData: () => new Float32Array(24) }; }
  createBufferSource() { return { connect: vi.fn(), start: vi.fn(), stop: vi.fn() }; }
  createBiquadFilter() { return { frequency: parameter(), connect: vi.fn() }; }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('AudioContext', AudioContextStub); });
it.each([false, true])('keeps a superseded resume paused, including after the fade has finished (%s)', async afterFade => {
  const engine = new WeatherAudio({ ...defaultPreferences('en-US'), music: false, ambience: false }, vi.fn());
  const context = engine.context as unknown as AudioContextStub;
  const interval = vi.spyOn(window, 'setInterval');
  const start = engine.start(); const pause = engine.pause();
  if (afterFade) { await vi.advanceTimersByTimeAsync(75); await pause; }
  context.resumes[0](); await start;
  expect(interval).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(75); await pause;
  expect(context.state).toBe('suspended');
  await engine.dispose();
});
it('keeps a newer resume running when an earlier pause finishes', async () => {
  const engine = new WeatherAudio({ ...defaultPreferences('en-US'), music: false, ambience: false }, vi.fn());
  const context = engine.context as unknown as AudioContextStub;
  const pause = engine.pause(); const start = engine.start();
  context.resumes[0](); await start;
  await vi.advanceTimersByTimeAsync(75); await pause;
  expect(context.state).toBe('running');
  await engine.dispose();
});
