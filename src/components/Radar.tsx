import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Place } from '../types';
import { useRadar } from '../hooks/useRadar';
import { RADAR_DELAYED, regionForPlace, type RadarLayer } from '../lib/radar';
import { localTime } from '../lib/weather';
import { triggerHaptic } from '../lib/native-experience';
import { Icon } from './Icons';
import type { RadarMapStatus } from './RadarMap';

const RadarMap = lazy(() => import('./RadarMap'));
const emptyMap: RadarMapStatus = { loading: true, time: null, error: null, outside: false };
class MapBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() {
    return this.state.failed ? <div className="radar-empty" role="status"><h2>Map couldn’t load</h2><p>Check your connection, then reload the app to try again.</p><button className="pixel-button small" onClick={() => window.location.reload()}>Reload app</button></div> : this.props.children;
  }
}
interface Props {
  place: Place | null; timezone?: string; now: number; online: boolean; active: boolean; allowPlayback: boolean;
  onPlaces: () => void;
}
export default function Radar({ place, timezone, now, online, active, allowPlayback, onPlaces }: Props) {
  const [layer, setLayer] = useState<RadarLayer>('intensity');
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mapState, setMapState] = useState<{ layer: RadarLayer; status: RadarMapStatus }>({ layer, status: emptyMap });
  const [retry, setRetry] = useState(0);
  const [rendererFailed, setRendererFailed] = useState(false);
  const region = regionForPlace(place);
  const radar = useRadar(region, layer, active, online);
  const frames = radar.manifest?.frames ?? [];
  const found = frames.findIndex(frame => frame.time === selected);
  const index = found < 0 ? frames.length - 1 : found;
  const frame = frames[index];
  const nextFrame = frames[(index + 1) % frames.length];
  const status = mapState.layer === layer ? mapState.status : emptyMap;
  const newest = frames.at(-1)?.time;
  const delayed = newest !== undefined && now - newest > RADAR_DELAYED;
  const canPlay = allowPlayback && active && online && frames.length > 1 && status.time !== null && !rendererFailed && !status.error && !status.outside;
  const clock = (time: number) => `${localTime(time / 1000, timezone || 'UTC', { hour: 'numeric', minute: '2-digit', hour12: true })}${timezone ? '' : ' UTC'}`;
  const fullClock = (time: number) => `${localTime(time / 1000, timezone || 'UTC', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;
  const onStatus = useCallback((value: RadarMapStatus) => setMapState({ layer, status: value }), [layer]);
  const stop = useCallback(() => setPlaying(false), []);
  const rendererError = useCallback(() => {
    setRendererFailed(true);
    onStatus({ loading: false, time: null, error: 'The map couldn’t load. Reload the app to try again.', outside: false });
  }, [onStatus]);
  useEffect(() => { if (!canPlay) setPlaying(false); }, [canPlay]);
  useEffect(() => {
    if (!playing || !canPlay || status.loading || status.time !== frame?.time) return;
    const timer = window.setTimeout(() => setSelected(nextFrame.time), index === frames.length - 1 ? 1400 : 700);
    return () => clearTimeout(timer);
  }, [playing, canPlay, status.loading, status.time, frame?.time, nextFrame, index, frames.length]);
  function changeLayer(value: RadarLayer) {
    if (value === layer) return;
    setLayer(value); setSelected(null); setPlaying(false); triggerHaptic('selection');
  }
  function retryMap() { stop(); setMapState({ layer, status: emptyMap }); setRetry(value => value + 1); radar.refresh(); }
  const showMap = !!place && !!radar.manifest && !!frame && online && active;
  return <main id="main-content" tabIndex={-1} className="radar-view">
    <div className="radar-heading"><div><p className="radar-eyebrow">A wider view of your weather</p><h1><Icon name="radar" size={25}/>Radar</h1></div>
      <button className="text-button" onClick={onPlaces} aria-label={place ? `Change radar location, ${place.name}` : 'Choose radar location'}><span>{place?.name ?? 'Choose a place'}</span><Icon name="chevron" size={13}/></button>
    </div>
    <div className="radar-layer-switch" role="group" aria-label="Radar layer">
      <button aria-pressed={layer === 'intensity'} onClick={() => changeLayer('intensity')}>Radar intensity</button>
      <button aria-pressed={layer === 'type'} onClick={() => changeLayer('type')}>Precipitation type</button>
    </div>
    <section className="radar-panel" aria-label="Weather radar map">
      {showMap ? <MapBoundary key={`${layer}:${retry}`} onError={rendererError}><Suspense fallback={<div className="radar-empty" role="status"><Icon name="radar" size={36}/><p>Opening your weather map…</p></div>}>
        <RadarMap key={`${layer}:${retry}`} place={place} manifest={radar.manifest!} frame={frame} nextFrame={playing && canPlay ? nextFrame : undefined} onStatus={onStatus} onMove={stop}/>
      </Suspense></MapBoundary> : <div className="radar-empty" role="status"><Icon name="radar" size={36}/>
        <h2>{!place ? 'Choose a place to explore' : !region ? 'Outside U.S. radar coverage' : !online ? 'Radar needs a connection' : !active ? 'Radar paused' : radar.error ? 'Radar unavailable' : 'Gathering radar observations…'}</h2>
        <p>{!place ? 'Your saved places and current location work here, too.' : !region ? 'This map uses NOAA’s U.S. regional radar networks.' : !online ? 'Connect to load current radar. Your saved forecast is still available on Today.' : radar.error ?? 'Recent observations will appear here.'}</p>
        {!place || !region ? <button className="pixel-button small" onClick={onPlaces}>Choose a place</button> : radar.error && online ? <button className="pixel-button small" onClick={retryMap}>Try again</button> : null}
      </div>}
      <div className="radar-attribution"><a href="https://www.weather.gov/radarfaq/" target="_blank" rel="noreferrer">Radar: NOAA / NWS</a><span>Map: <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a></span></div>
    </section>
    {radar.manifest && frame ? <section className="radar-timeline" aria-label="Radar history">
      <div className="radar-time-heading"><div><span className="radar-eyebrow">{status.time && showMap ? 'Image shown' : 'Observation time'}</span><p><time dateTime={new Date(status.time && showMap ? status.time : frame.time).toISOString()} title={fullClock(status.time && showMap ? status.time : frame.time)}>{clock(status.time && showMap ? status.time : frame.time)}</time></p></div>
        <span className={`radar-freshness${delayed ? ' is-delayed' : ''}`}>{!online ? 'Offline' : delayed ? 'Data delayed' : `${Math.max(0, Math.floor((now - (newest ?? now)) / 60000))} min ago`}</span></div>
      <input type="range" min="0" max={frames.length - 1} step="1" value={Math.max(0, index)} aria-label="Radar observation time" aria-valuetext={fullClock(frame.time)} disabled={!online || !active} onChange={event => { stop(); const time = frames[Number(event.target.value)].time; if (time !== frame.time) { setSelected(time); triggerHaptic('selection', true); } }}/>
      <div className="radar-time-labels" aria-hidden="true"><span>{clock(frames[0].time)}</span><span>Past 2 hours</span><span>{clock(newest!)}</span></div>
      <div className="radar-playback"><button className="pixel-button small" disabled={!canPlay} aria-pressed={playing && canPlay} onClick={() => { setPlaying(value => !value); triggerHaptic('selection'); }}><Icon name={playing && canPlay ? 'pause' : 'play'} size={15}/>{playing && canPlay ? 'Pause' : 'Play'}</button>
        <button className="text-button" disabled={!online || !active} onClick={() => { if (frame.time !== newest) triggerHaptic('selection'); stop(); setSelected(null); }}>Latest</button>
        <button className="text-button radar-refresh" onClick={retryMap} disabled={!online || !active || radar.loading}><Icon name="refresh" size={14}/>{radar.loading ? 'Refreshing…' : 'Refresh'}</button></div>
      <p className="radar-load-status" role="status">{!online ? 'Offline. Reconnect to load imagery.' : status.outside ? 'This view is outside the selected regional radar coverage. Recenter or choose another place.' : status.error ?? radar.error ?? (status.loading ? `Loading ${clock(frame.time)} imagery…` : delayed ? `Newest observation: ${fullClock(newest!)}. Waiting for updated data.` : !allowPlayback ? 'Playback paused to respect motion or power settings. Slide to explore.' : 'Slide through recent observations, or play the loop.')}</p>
      {status.error && online && !rendererFailed ? <button className="text-button" onClick={retryMap}>Retry imagery</button> : null}
    </section> : null}
    <section className="radar-legend" aria-labelledby="radar-legend-title"><h2 id="radar-legend-title">{layer === 'intensity' ? 'Radar intensity' : 'Precipitation type'}</h2>
      {layer === 'intensity' ? <><img src="/radar/BREFQCD_CT.png" width="500" height="36" alt="NOAA echo-strength legend marked from −20 to 70 dBZ. Stronger echoes progress through green, yellow, red, and purple."/><p>Echo strength in dBZ. Stronger echoes can indicate heavier precipitation.</p></>
        : <><img src="/radar/PCPNTYP_CT.png" width="500" height="34" alt="NOAA precipitation categories from left to right: warm stratiform rain, snow, convective rain, hail, cool stratiform rain, tropical stratiform rain, tropical convective rain"/><details><summary>Read the color key</summary><dl className="radar-type-key"><div><dt>WS</dt><dd>Warm stratiform rain</dd></div><div><dt>S</dt><dd>Snow</dd></div><div><dt>C</dt><dd>Convective rain</dd></div><div><dt>H</dt><dd>Hail</dd></div><div><dt>CS</dt><dd>Cool stratiform rain</dd></div><div><dt>ST</dt><dd>Tropical stratiform rain</dd></div><div><dt>CT</dt><dd>Tropical convective rain</dd></div></dl></details><p>Radar-estimated type. Sleet and freezing rain are not identified separately.</p></>}
      <p>Coverage varies. Blank areas may have no radar data.</p>
    </section>
    <footer className="radar-footer">Recent observations · not a future forecast{region ? <span>{region.label} · NOAA MRMS</span> : null}<a href="/radar/credits.html">Map credits &amp; licenses</a></footer>
  </main>;
}
