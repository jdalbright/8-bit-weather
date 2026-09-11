import { isAppActive, NATIVE_ACTIVITY_EVENT } from '../lib/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WeatherAudio } from '../audio/engine';
import { compositions, moodFor } from '../audio/compositions';
import type { Discovery, Preferences, SceneState } from '../types';

export function useAudio(preferences: Preferences, scene: SceneState) {
  const engine = useRef<WeatherAudio | null>(null);
  const enabledRef = useRef(false);
  const activity = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { kind, isDay, wind, phase, transition, daylight, windStrength, precipitationIntensity } = scene;
  useEffect(() => { engine.current?.configure(preferences, { kind, isDay, wind, phase, transition, daylight, windStrength, precipitationIntensity }); }, [preferences, kind, isDay, wind, phase, transition, daylight, windStrength, precipitationIntensity]);
  const toggle = useCallback(async () => {
    const attempt = ++activity.current;
    setError(null);
    if (enabledRef.current) {
      enabledRef.current = false; setEnabled(false); setPlaying(false);
      await engine.current?.pause(); return;
    }
    try {
      // AudioContext is created synchronously inside this user gesture for mobile Safari.
      if (!engine.current) engine.current = new WeatherAudio(preferences, () => setPlaying(enabledRef.current && engine.current?.context.state === 'running' && isAppActive()));
      engine.current.configure(preferences, { kind, isDay, wind, phase, transition, daylight, windStrength, precipitationIntensity });
      enabledRef.current = true;
      setEnabled(true);
      await engine.current.start();
      if (attempt !== activity.current || !enabledRef.current || !isAppActive()) return;
      setPlaying(true); engine.current.effect('success');
    } catch (e) {
      if (attempt !== activity.current) return;
      enabledRef.current = false; setEnabled(false); setPlaying(false); setError(e instanceof Error ? e.message : 'Audio could not start. Please try again.');
    }
  }, [preferences, kind, isDay, wind, phase, transition, daylight, windStrength, precipitationIntensity]);
  const stop = useCallback(() => { activity.current++; enabledRef.current = false; setEnabled(false); setPlaying(false); void engine.current?.pause(); }, []);
  const effect = useCallback((type: 'tap' | 'success' | 'remove' | Discovery = 'tap') => engine.current?.effect(type), []);
  useEffect(() => {
    const invalidate = () => ++activity.current;
    const visibility = () => {
      const attempt = invalidate();
      if (!isAppActive()) { setPlaying(false); void engine.current?.pause(); }
      else if (enabledRef.current) void engine.current?.start().then(() => {
        if (attempt === activity.current && enabledRef.current && isAppActive()) setPlaying(true);
      }).catch(() => {
        if (attempt !== activity.current) return;
        enabledRef.current = false; setEnabled(false); setPlaying(false); setError('Tap Sound to resume the music.');
      });
    };
    window.addEventListener(NATIVE_ACTIVITY_EVENT, visibility);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener(NATIVE_ACTIVITY_EVENT, visibility); invalidate(); document.removeEventListener('visibilitychange', visibility); void engine.current?.dispose(); engine.current = null; };
  }, []);
  return { enabled, playing, toggle, stop, effect, error, trackName: compositions[moodFor(scene)].name };
}
