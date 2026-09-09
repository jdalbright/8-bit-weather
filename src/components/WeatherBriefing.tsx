import type { Units, WeatherSnapshot } from '../types';
import { useBriefing } from '../hooks/useBriefing';
import { localTime } from '../lib/weather';

export function WeatherBriefing({ snapshot, units, online, now }: { snapshot: WeatherSnapshot; units: Units; online: boolean; now: number }) {
  const { briefing, error, loading, eligible, retry, canRetry } = useBriefing(snapshot, units, online, now);
  return <section className="weather-briefing" aria-labelledby="briefing-title" aria-busy={loading}>
    <div className="briefing-heading"><h2 id="briefing-title">Weather briefing</h2><span className="briefing-badge">AI summary</span></div>
    <div role="status" aria-live="polite">
      {briefing ? <>
        <p className="briefing-copy">{briefing.text}</p>
        <p className="briefing-meta">{!online ? 'Saved briefing' : 'Next 24 hours'} · {localTime(briefing.generatedAt / 1000, snapshot.timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
      </> : <p className="briefing-copy briefing-placeholder">{!online ? 'Connect for a fresh weather briefing.' : !eligible && !loading ? 'A fresh, complete forecast is needed for your briefing.' : error ? error.message : 'Putting your next 24 hours into words…'}</p>}
    </div>
    {error && online && !briefing ? <button className="text-button briefing-retry" onClick={retry} disabled={!canRetry}>Retry briefing</button> : null}
  </section>;
}
