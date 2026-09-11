import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { welcomeScene } from '../lib/scene';
import type { SceneState } from '../types';
import { defaultPreferences } from '../lib/storage';
import { useAudio } from './useAudio';
import { usePreviewAudioScene } from './usePreviewAudioScene';

const engine = vi.hoisted(() => ({ configure: vi.fn(), start: vi.fn(async () => {}), pause: vi.fn(async () => {}), created: vi.fn() }));
vi.mock('../audio/engine', () => ({ WeatherAudio: class {
  constructor() { engine.created(); }
  context = { state: 'running' };
  configure = engine.configure; start = engine.start; pause = engine.pause;
  effect() {} dispose() {}
} }));
const rain: SceneState = { ...welcomeScene, kind: 'rain' };
const snow: SceneState = { ...welcomeScene, kind: 'snow' };
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); });

it('coalesces dragging, restores current audio immediately, and cancels obsolete location updates', () => {
  const { result, rerender, unmount } = renderHook(({ preview, key }) => usePreviewAudioScene(welcomeScene, preview, key), { initialProps: { preview: null as SceneState | null, key: 'a' } });
  rerender({ preview: rain, key: 'a' });
  act(() => vi.advanceTimersByTime(150));
  rerender({ preview: snow, key: 'a' });
  act(() => vi.advanceTimersByTime(199));
  expect(result.current).toBe(welcomeScene);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe(snow);
  rerender({ preview: rain, key: 'a' });
  expect(result.current).toBe(snow);
  rerender({ preview: null, key: 'a' });
  expect(result.current).toBe(welcomeScene);
  act(() => vi.advanceTimersByTime(200));
  expect(result.current).toBe(welcomeScene);
  rerender({ preview: rain, key: 'a' });
  act(() => vi.advanceTimersByTime(200));
  rerender({ preview: snow, key: 'b' });
  expect(result.current).toBe(welcomeScene);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it('does not activate sound through preview; enabled sound follows the settled forecast', async () => {
  const preferences = defaultPreferences('en-US');
  const { result, rerender } = renderHook(({ preview }) => {
    const scene = usePreviewAudioScene(welcomeScene, preview, 'a');
    return useAudio(preferences, scene);
  }, { initialProps: { preview: null as SceneState | null } });
  rerender({ preview: rain });
  act(() => vi.advanceTimersByTime(200));
  expect(result.current.enabled).toBe(false);
  expect(engine.created).not.toHaveBeenCalled();
  await act(() => result.current.toggle());
  expect(engine.configure).toHaveBeenLastCalledWith(preferences, rain);
  rerender({ preview: snow });
  act(() => vi.advanceTimersByTime(200));
  expect(engine.configure).toHaveBeenLastCalledWith(preferences, snow);
  rerender({ preview: null });
  expect(engine.configure).toHaveBeenLastCalledWith(preferences, welcomeScene);
  await act(() => result.current.toggle());
  const starts = engine.start.mock.calls.length;
  rerender({ preview: rain });
  act(() => vi.advanceTimersByTime(200));
  expect(result.current.enabled).toBe(false);
  expect(engine.start).toHaveBeenCalledTimes(starts);
});
