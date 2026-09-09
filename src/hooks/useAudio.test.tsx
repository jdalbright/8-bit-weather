import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useAudio } from './useAudio';
import { defaultPreferences } from '../lib/storage';
import { welcomeScene } from '../lib/scene';

const audio = vi.hoisted(() => ({
  starts: [] as { resolve: () => void; reject: (error: Error) => void }[],
  pause: vi.fn(), effect: vi.fn(), dispose: vi.fn(),
}));
vi.mock('../audio/engine', () => ({ WeatherAudio: class {
  context = { state: 'running' };
  configure() {}
  start() { return new Promise<void>((resolve, reject) => audio.starts.push({ resolve, reject })); }
  pause = audio.pause;
  effect = audio.effect;
  dispose = audio.dispose;
} }));
beforeEach(() => {
  audio.starts = []; vi.clearAllMocks();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
it.each(['resolve', 'reject'] as const)('keeps a later mute when a pending start completes with %s', async completion => {
  const { result } = renderHook(() => useAudio(defaultPreferences('en-US'), welcomeScene));
  let start!: Promise<void>;
  act(() => { start = result.current.toggle(); });
  await act(async () => result.current.toggle());
  await act(async () => {
    if (completion === 'resolve') audio.starts[0].resolve(); else audio.starts[0].reject(new Error('Old startup failed'));
    await start;
  });
  expect(result.current.enabled).toBe(false); expect(result.current.playing).toBe(false);
  expect(result.current.error).toBeNull(); expect(audio.effect).not.toHaveBeenCalled();
});
it('keeps background audio paused when startup finishes, and resumes only while still enabled', async () => {
  const hidden = vi.spyOn(document, 'hidden', 'get');
  const { result } = renderHook(() => useAudio(defaultPreferences('en-US'), welcomeScene));
  let start!: Promise<void>;
  act(() => { start = result.current.toggle(); });
  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await act(async () => { audio.starts[0].resolve(); await start; });
  expect(result.current.enabled).toBe(true); expect(result.current.playing).toBe(false);
  hidden.mockReturnValue(false);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  act(() => result.current.stop());
  await act(async () => audio.starts[1].resolve());
  expect(result.current.enabled).toBe(false); expect(result.current.playing).toBe(false);
});
it('ignores startup completion after unmount', async () => {
  const { result, unmount } = renderHook(() => useAudio(defaultPreferences('en-US'), welcomeScene));
  let start!: Promise<void>;
  act(() => { start = result.current.toggle(); });
  unmount();
  await act(async () => { audio.starts[0].resolve(); await start; });
  expect(audio.dispose).toHaveBeenCalledOnce(); expect(audio.effect).not.toHaveBeenCalled();
});
