import { useCallback, useEffect, useRef, useState } from 'react';
import { WeatherAudio } from '../audio/engine';
import { compositions, moodFor } from '../audio/compositions';
import type { Preferences, SceneState } from '../types';

export function useAudio(preferences: Preferences, scene: SceneState) {
  const engine = useRef<WeatherAudio | null>(null);
  const enabledRef = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { kind, isDay, wind } = scene;
  useEffect(() => { engine.current?.configure(preferences, { kind, isDay, wind }); }, [preferences, kind, isDay, wind]);
  const toggle = useCallback(async () => {
    setError(null);
    if (enabledRef.current) {
      enabledRef.current = false; setEnabled(false); setPlaying(false);
      await engine.current?.pause(); return;
    }
    try {
      // AudioContext is created synchronously inside this user gesture for mobile Safari.
      if (!engine.current) engine.current = new WeatherAudio(preferences, () => setPlaying(enabledRef.current && engine.current?.context.state === 'running' && !document.hidden));
      engine.current.configure(preferences, { kind, isDay, wind });
      enabledRef.current = true;
      await engine.current.start(); setEnabled(true); setPlaying(true); engine.current.effect('success');
    } catch (e) { enabledRef.current = false; setEnabled(false); setPlaying(false); setError(e instanceof Error ? e.message : 'Audio could not start. Please try again.'); }
  }, [preferences, kind, isDay, wind]);
  const stop = useCallback(() => { enabledRef.current = false; setEnabled(false); setPlaying(false); void engine.current?.pause(); }, []);
  const effect = useCallback((type: 'tap' | 'success' | 'remove' = 'tap') => engine.current?.effect(type), []);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) { setPlaying(false); void engine.current?.pause(); }
      else if (enabledRef.current) void engine.current?.start().then(() => setPlaying(true)).catch(() => { enabledRef.current = false; setEnabled(false); setPlaying(false); setError('Tap Sound to resume the music.'); });
    };
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); void engine.current?.dispose(); engine.current = null; };
  }, []);
  return { enabled, playing, toggle, stop, effect, error, trackName: compositions[moodFor(scene)].name };
}
