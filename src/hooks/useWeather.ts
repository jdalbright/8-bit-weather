import { isAppActive, NATIVE_ACTIVITY_EVENT } from '../lib/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWeather, WeatherRequestError } from '../lib/api';
import { cachedWeather, cacheWeather } from '../lib/storage';
import { cacheMatches, isFresh, WEATHER_CHECK_INTERVAL } from '../lib/weather';
import type { Place, WeatherSnapshot } from '../types';

export type RefreshOutcome = 'success' | 'failure' | 'skipped' | 'cancelled';

type State = { snapshot: WeatherSnapshot | null; loading: boolean; error: string | null; placeId: string | null };
export function useWeather(place: Place | null) {
  const [state, setState] = useState<State>({ snapshot: null, loading: false, error: null, placeId: null });
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(Date.now);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const cooldown = useRef(0);
  const [retryAt, setRetryAt] = useState(0);
  const latest = useRef<WeatherSnapshot | null>(null);
  const refresh = useCallback(async (force = false, onRequestStarted?: () => void): Promise<RefreshOutcome> => {
    request.current?.abort();
    const attempt = ++generation.current;
    if (!place) { latest.current = null; setState({ snapshot: null, loading: false, error: null, placeId: null }); return 'skipped'; }
    const stored = cachedWeather(place);
    const memory = latest.current && cacheMatches(latest.current, place) ? latest.current : null;
    const cache = memory && (!stored || memory.fetchedAt >= stored.fetchedAt) ? memory : stored;
    latest.current = cache;
    if (!navigator.onLine) { setState({ snapshot: cache, loading: false, error: cache ? null : 'You’re offline. Connect to load weather for this place.', placeId: place.id }); return 'skipped'; }
    if ((!force && cache && cache.provider === 'xweather' && cache.current.precipitationProbability !== undefined && isFresh(cache)) || Date.now() < cooldown.current) {
      setState(previous => ({ snapshot: cache, loading: false, error: Date.now() < cooldown.current ? previous.error : null, placeId: place.id }));
      return 'skipped';
    }
    onRequestStarted?.();
    const controller = new AbortController();
    request.current = controller;
    setState({ snapshot: cache, loading: true, error: null, placeId: place.id });
    try {
      const snapshot = await fetchWeather(place, controller.signal);
      if (controller.signal.aborted || attempt !== generation.current) return 'cancelled';
      cacheWeather(snapshot);
      latest.current = snapshot;
      setState({ snapshot, loading: false, error: null, placeId: place.id });
      setNow(Date.now());
      return 'success';
    } catch (error) {
      if (controller.signal.aborted || attempt !== generation.current) return 'cancelled';
      if (error instanceof WeatherRequestError && error.retryAfterMs) {
        cooldown.current = Date.now() + error.retryAfterMs;
        setRetryAt(cooldown.current);
        setNow(Date.now());
      }
      setState({ snapshot: cache, loading: false, error: error instanceof Error ? error.message : 'Couldn’t load the forecast. Please try again.', placeId: place.id });
      return 'failure';
    }
  }, [place]);
  useEffect(() => {
    void refresh();
    return () => { request.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    const onlineChanged = () => { setOnline(navigator.onLine); if (navigator.onLine) void refresh(); };
    const visible = () => { if (isAppActive()) { setNow(Date.now()); void refresh(); } };
    const interval = window.setInterval(() => { if (isAppActive()) void refresh(); }, WEATHER_CHECK_INTERVAL);
    const clock = window.setInterval(() => { if (isAppActive()) setNow(Date.now()); }, 30000);
    window.addEventListener(NATIVE_ACTIVITY_EVENT, visible); window.addEventListener('online', onlineChanged); window.addEventListener('offline', onlineChanged); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener(NATIVE_ACTIVITY_EVENT, visible); clearInterval(interval); clearInterval(clock); window.removeEventListener('online', onlineChanged); window.removeEventListener('offline', onlineChanged); document.removeEventListener('visibilitychange', visible); };
  }, [refresh]);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = window.setTimeout(() => setNow(Date.now()), retryAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [retryAt]);
  const snapshot = place && state.snapshot && cacheMatches(state.snapshot, place) ? state.snapshot : null;
  return { snapshot, loading: state.loading || (!!place && state.placeId !== place.id), error: state.placeId === place?.id ? state.error : null, online, now, refresh, retryAfterMs: Math.max(0, retryAt - now) };
}
