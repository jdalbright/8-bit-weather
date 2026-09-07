import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWeather, WeatherRequestError } from '../lib/api';
import { cachedWeather, cacheWeather } from '../lib/storage';
import { cacheMatches, FRESH_FOR, isFresh } from '../lib/weather';
import type { Place, WeatherSnapshot } from '../types';

type State = { snapshot: WeatherSnapshot | null; loading: boolean; error: string | null; placeId: string | null };
export function useWeather(place: Place | null) {
  const [state, setState] = useState<State>({ snapshot: null, loading: false, error: null, placeId: null });
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(Date.now);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const cooldown = useRef(0);
  const refresh = useCallback(async (force = false) => {
    request.current?.abort();
    const attempt = ++generation.current;
    if (!place) { setState({ snapshot: null, loading: false, error: null, placeId: null }); return; }
    const cache = cachedWeather(place);
    if (!navigator.onLine) { setState({ snapshot: cache, loading: false, error: cache ? null : 'You’re offline. Connect to load weather for this place.', placeId: place.id }); return; }
    if ((!force && cache && isFresh(cache)) || Date.now() < cooldown.current) {
      setState(previous => ({ snapshot: cache, loading: false, error: Date.now() < cooldown.current ? previous.error : null, placeId: place.id }));
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setState({ snapshot: cache, loading: true, error: null, placeId: place.id });
    try {
      const snapshot = await fetchWeather(place, controller.signal);
      if (controller.signal.aborted || attempt !== generation.current) return;
      cacheWeather(snapshot);
      setState({ snapshot, loading: false, error: null, placeId: place.id });
      setNow(Date.now());
    } catch (error) {
      if (controller.signal.aborted || attempt !== generation.current) return;
      if (error instanceof WeatherRequestError && error.retryAfterMs) cooldown.current = Date.now() + error.retryAfterMs;
      setState({ snapshot: cache, loading: false, error: error instanceof Error ? error.message : 'Couldn’t load the forecast. Please try again.', placeId: place.id });
    }
  }, [place]);
  useEffect(() => {
    void refresh();
    return () => { request.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    const onlineChanged = () => { setOnline(navigator.onLine); if (navigator.onLine) void refresh(); };
    const visible = () => { if (!document.hidden) { setNow(Date.now()); void refresh(); } };
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(); }, FRESH_FOR);
    const clock = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 30000);
    window.addEventListener('online', onlineChanged); window.addEventListener('offline', onlineChanged); document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(interval); clearInterval(clock); window.removeEventListener('online', onlineChanged); window.removeEventListener('offline', onlineChanged); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  const snapshot = place && state.snapshot && cacheMatches(state.snapshot, place) ? state.snapshot : null;
  return { snapshot, loading: state.loading || (!!place && state.placeId !== place.id), error: state.placeId === place?.id ? state.error : null, online, now, refresh };
}
