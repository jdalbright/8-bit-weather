import { useState } from 'react';
import type { Units, WeatherSnapshot } from '../types';
import { useBriefing } from '../hooks/useBriefing';
import { isNativeApp } from '../lib/native';
import { localTime } from '../lib/weather';
import { Icon } from './Icons';

export function WeatherBriefing({ snapshot, units, online, now }: { snapshot: WeatherSnapshot; units: Units; online: boolean; now: number }) {
  const { briefing, error, loading, eligible, retry, canRetry } = useBriefing(snapshot, units, online, now);
  const [expanded, setExpanded] = useState(true);
  return <section className="weather-briefing" aria-labelledby="briefing-title" aria-busy={loading}>
    <h2 className="briefing-heading"><button type="button" className="briefing-toggle" aria-expanded={expanded} aria-controls="briefing-details" onClick={() => setExpanded(value => !value)}>
      <span id="briefing-title" className="briefing-title">Weather briefing</span><span className="briefing-badge">{briefing?.provider === 'apple' ? 'Apple Intelligence' : briefing?.provider === 'openai' ? 'OpenAI' : 'AI summary'}</span><Icon name="chevron" size={16}/>
    </button></h2>
    <div id="briefing-details" className="briefing-disclosure" data-expanded={expanded} aria-hidden={!expanded} inert={!expanded}>
    <div className="briefing-disclosure-content"><div className="briefing-body">
    <div role="status" aria-live="polite">
      {briefing ? <>
        <p className="briefing-copy">{briefing.text}</p>
        <p className="briefing-meta">{!online ? briefing.provider === 'apple' ? 'Offline · Next 24 hours' : 'Saved briefing' : 'Next 24 hours'} · {localTime(briefing.generatedAt / 1000, snapshot.timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
      </> : <p className="briefing-copy briefing-placeholder">{loading ? 'Putting your next 24 hours into words…' : error ? (!online ? 'On-device briefing unavailable. Connect to use OpenAI, or retry.' : error.message) : !online && !isNativeApp() ? 'Connect for a fresh weather briefing.' : !online ? 'A fresh forecast is needed for a new briefing. Connect to update your weather.' : 'A fresh, complete forecast is needed for your briefing.'}</p>}
    </div>
    {error && eligible && !briefing ? <button className="text-button briefing-retry" onClick={retry} disabled={!canRetry}>Retry briefing</button> : null}
    </div></div></div>
  </section>;
}
