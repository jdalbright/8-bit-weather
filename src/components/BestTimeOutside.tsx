import { useEffect, useId, useRef, useState } from 'react';
import type { Units, WeatherSnapshot } from '../types';
import { outdoorWindows, type OutdoorDay } from '../lib/outdoor';
import { outdoorRequest, validOutdoorRecommendation, type OutdoorRecommendation, type OutdoorRequest } from '../lib/outdoor-ai';
import { generateOutdoorRecommendation, OutdoorError } from '../lib/outdoor-client';
import { localDate, localTime, percent, temperature, windSpeed } from '../lib/weather';
import { Icon } from './Icons';

interface Props { snapshot: WeatherSnapshot; now: number; online: boolean; units: Units; onPreview?: (time: number) => void }

export function BestTimeOutside(props: Props) {
  const { snapshot } = props;
  const now = Math.max(props.now, Date.now());
  return <OutdoorCard key={`${snapshot.placeId}:${snapshot.latitude}:${snapshot.longitude}:${snapshot.timezone}:${localDate(now, snapshot.timezone)}`} {...props} now={now}/>;
}

function OutdoorCard({ snapshot, now, ...props }: Props) {
  const titleId = useId();
  const [day, setDay] = useState<OutdoorDay>('today');
  const request = outdoorRequest(snapshot, now, day, 'any');
  return <section className="best-time-outside" aria-labelledby={titleId}>
    <h2 id={titleId}><Icon name="sunrise" size={18}/>Best time outside</h2>
    <div className="outdoor-days" role="group" aria-label="Day to go outside" data-pull-refresh-ignore>
      <button aria-pressed={day === 'today'} onClick={() => setDay('today')}>Today</button>
      <button aria-pressed={day === 'tomorrow'} onClick={() => setDay('tomorrow')}>Tomorrow</button>
    </div>
    <Recommendation key={JSON.stringify(request)} request={request} now={now} {...props}/>
  </section>;
}

function Recommendation({ request, now, online, units, onPreview }: Omit<Props, 'snapshot'> & { request: OutdoorRequest }) {
  const statusId = useId();
  const [recommendation, setRecommendation] = useState<OutdoorRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<OutdoorError | null>(null);
  const [retryClock, setRetryClock] = useState(now);
  const clockNow = Math.max(now, Date.now());
  useEffect(() => {
    if (!recommendation) return;
    const timer = globalThis.setTimeout(() => setRecommendation(null), Math.max(0, recommendation.expiresAt - Date.now()));
    return () => globalThis.clearTimeout(timer);
  }, [recommendation]);
  useEffect(() => {
    if (!error || error.retryAt <= Date.now()) return;
    const timer = globalThis.setTimeout(() => setRetryClock(Date.now()), error.retryAt - Date.now());
    return () => globalThis.clearTimeout(timer);
  }, [error]);
  const pending = useRef<AbortController | null>(null);
  // Filter/forecast/location changes unmount this request session and cancel obsolete work.
  useEffect(() => () => { pending.current?.abort(); }, []);
  const eligible = outdoorWindows(request.forecast, clockNow, request.day, request.period);
  const valid = recommendation && validOutdoorRecommendation(recommendation, request, clockNow);
  const window = valid && eligible.status === 'recommended' ? eligible.windows.find(hour => hour.start === recommendation.start) : undefined;
  const clock = (time: number) => localTime(time, request.forecast.timezone, { hour: 'numeric', minute: '2-digit' });
  const empty = {
    'no-comfortable-window': 'No comfortable window: no clear or cloudy daylight hour is available. Try the other day.',
    'no-daylight': 'No daylight remaining for a full hour. Try the other day.',
    unavailable: 'Forecast details unavailable. Refresh the weather to check again.',
  } as const;
  const compromise = eligible.status === 'recommended' && !eligible.windows[0].meetsPreferences;
  const generate = async () => {
    if (pending.current || !online || outdoorWindows(request.forecast, Math.max(now, Date.now()), request.day, request.period).status !== 'recommended') return;
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError(null);
    try {
      const result = await generateOutdoorRecommendation(request, controller.signal);
      if (!controller.signal.aborted) setRecommendation(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof OutdoorError ? failure : new OutdoorError('AI couldn’t generate a recommendation. Please try again.'));
    } finally {
      if (!controller.signal.aborted) { pending.current = null; setLoading(false); }
    }
  };
  return <>
    <div id={statusId} className="outdoor-result" role="status" aria-live="polite" aria-atomic="true" aria-busy={loading}>
      {window && recommendation ? <>
        {!window.meetsPreferences ? <p className="outdoor-notice">Best available hour · Conditions fall outside the comfort preferences.</p> : null}
        <p className="outdoor-time"><time dateTime={new Date(window.start * 1000).toISOString()}>{clock(window.start)}</time><span>–</span><time dateTime={new Date(window.end * 1000).toISOString()}>{clock(window.end)}</time></p>
        <dl className="outdoor-conditions">
          <div><dt>Temperature</dt><dd aria-label={`${temperature(window.temperature, units)} ${units === 'imperial' ? 'Fahrenheit' : 'Celsius'}`}>{temperature(window.temperature, units)}</dd></div>
          <div><dt>Precip chance</dt><dd>{percent(window.precipitation)} precip</dd></div>
          <div><dt>Wind</dt><dd>{windSpeed(window.wind, units)} wind</dd></div>
          <div><dt>UV index</dt><dd>UV {Number(window.uv.toFixed(1))}</dd></div>
        </dl>
        <p className="outdoor-explanation">{recommendation.text}</p>
        <p className="outdoor-meta">{online ? 'AI recommendation' : 'Saved AI recommendation'} · OpenAI · {clock(recommendation.generatedAt / 1000)} · Forecast {clock(request.forecast.sectionTimes!.forecast / 1000)}</p>
      </> : eligible.status !== 'recommended' ? <p className="outdoor-notice">{empty[eligible.status]}</p>
        : loading ? <span className="sr-only">AI is finding a good hour for you…</span>
        : !online ? <p className="outdoor-notice">Connect to generate an AI recommendation.</p>
        : error ? <p className="outdoor-notice">{error.message}</p>
        : compromise ? <p className="outdoor-notice">No hour meets every comfort preference. Ask OpenAI for the best available option and its tradeoffs.</p> : null}
    </div>
    {(!window || !!onPreview) ? <button className="outdoor-action"
      aria-label={window ? 'Preview this hour' : undefined}
      aria-describedby={!window ? statusId : undefined}
      title={window ? undefined : 'Ask OpenAI for an outdoor recommendation'}
      disabled={!window && (eligible.status !== 'recommended' || loading || !online || !!error && Math.max(clockNow, retryClock) < error.retryAt)}
      onClick={() => {
        if (!window) { void generate(); return; }
        if (validOutdoorRecommendation(recommendation, request, Math.max(now, Date.now()))) onPreview?.(window.start);
        else setRecommendation(null);
      }}>
      {window ? <>Preview<Icon name="next" size={12}/></> : loading ? 'Generating…' : error ? 'Try again' : 'Ask OpenAI'}
    </button> : null}
  </>;
}
