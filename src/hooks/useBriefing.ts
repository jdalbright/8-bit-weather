import { useEffect, useRef, useState } from 'react';
import { isAppActive, isNativeApp, NATIVE_ACTIVITY_EVENT } from '../lib/native';
import type { Units, WeatherSnapshot } from '../types';
import { BRIEFING_VERSION, briefingForecast, forecastUsable } from '../lib/briefing';
import { acquireBriefing, BriefingError, cachedBriefing } from '../lib/briefing-client';

export function useBriefing(snapshot: WeatherSnapshot, units: Units, online: boolean, now: number) {
  const [visible, setVisible] = useState(isAppActive());
  const [retry, setRetry] = useState(0);
  const retryRequested = useRef<string | null>(null);
  const [state, setState] = useState<{ key: string; error?: BriefingError }>({ key: '' });
  const clock = Math.max(now, Date.now());
  const forecast = briefingForecast(snapshot, units, clock);
  const scope = JSON.stringify([snapshot.placeId, snapshot.latitude, snapshot.longitude, snapshot.fetchedAt, units, BRIEFING_VERSION]);
  const key = JSON.stringify([scope, forecast]);
  const usable = forecastUsable(forecast, clock);
  const cached = !online || usable ? cachedBriefing(key, scope, clock, !online) : null;
  const eligible = (online || isNativeApp()) && visible && usable;
  const requestKey = JSON.stringify([key, online]);
  const ready = !!cached;
  useEffect(() => {
    const changed = () => setVisible(isAppActive());
    document.addEventListener('visibilitychange', changed);
    window.addEventListener(NATIVE_ACTIVITY_EVENT, changed);
    return () => { document.removeEventListener('visibilitychange', changed); window.removeEventListener(NATIVE_ACTIVITY_EVENT, changed); };
  }, []);
  useEffect(() => {
    if (!eligible || ready) return;
    let active = true;
    // The key contains the complete payload, avoiding effects on unrelated clock updates.
    const [, payload] = JSON.parse(key) as [string, ReturnType<typeof briefingForecast>];
    const explicitRetry = retryRequested.current === requestKey;
    retryRequested.current = null;
    const job = acquireBriefing(key, scope, payload, explicitRetry, online);
    void job.promise.then(() => { if (active) setState({ key: requestKey }); }, error => {
      if (active) setState({ key: requestKey, error: error instanceof BriefingError ? error : new BriefingError() });
    });
    return () => { active = false; job.release(); };
  }, [key, requestKey, scope, eligible, ready, retry, online]);
  const error = state.key === requestKey ? state.error : undefined;
  return { briefing: cached, error, loading: eligible && !cached && !error, eligible,
    retry: () => { retryRequested.current = requestKey; setState({ key: requestKey }); setRetry(count => count + 1); }, canRetry: eligible && !!error && clock >= error.retryAt };
}
