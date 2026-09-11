import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRadarManifest, RADAR_REFRESH, RadarRequestError, type RadarLayer, type RadarManifest, type RadarRegion } from '../lib/radar';

export function useRadar(region: RadarRegion | null, layer: RadarLayer, active: boolean, online: boolean) {
  const [state, setState] = useState<{ manifest: RadarManifest | null; loading: boolean; error: string | null }>({ manifest: null, loading: false, error: null });
  const [revision, setRevision] = useState(0);
  const cooldown = useRef(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!region || !active || !online) return;
    let controller: AbortController | null = null;
    let disposed = false;
    const load = async () => {
      if (disposed || Date.now() < cooldown.current || controller) return;
      const request = new AbortController(); controller = request;
      setState(previous => ({ ...previous, loading: true, error: null }));
      try {
        const manifest = await fetchRadarManifest(region, layer, request.signal);
        if (!disposed && !request.signal.aborted) setState({ manifest, loading: false, error: null });
      } catch (error) {
        if (disposed || request.signal.aborted) return;
        if (error instanceof RadarRequestError) cooldown.current = Date.now() + error.retryAfter;
        setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'Radar is unavailable. Try again shortly.' }));
      } finally { if (controller === request) controller = null; }
    };
    void load();
    const interval = window.setInterval(() => void load(), RADAR_REFRESH);
    return () => { disposed = true; controller?.abort(); clearInterval(interval); };
  }, [region, layer, active, online, revision]);
  const manifest = state.manifest && state.manifest.region.id === region?.id && state.manifest.layer === layer ? state.manifest : null;
  return { manifest, loading: active && online && !!region && (state.loading || (!manifest && !state.error)), error: state.error, refresh };
}
