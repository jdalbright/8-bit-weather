import { triggerHaptic } from '../lib/native-experience';
import { useState } from 'react';
import { localTime } from '../lib/weather';
import { UV_LEVELS, uvInfo, validUv, type UvForecast } from '../lib/uv';

export function UvScale({ value, compact = false }: { value: number | null; compact?: boolean }) {
  const active = uvInfo(value)?.level.id;
  return <span className={`uv-scale${compact ? ' compact' : ''}`} aria-hidden={compact || undefined}>
    {UV_LEVELS.map(level => <span key={level.id} data-uv={level.id} data-active={active === level.id}>
      <i aria-hidden="true"/>{!compact ? <><strong>{level.range}</strong><span>{level.label}</span></> : null}
    </span>)}
  </span>;
}
interface Props { forecast: UvForecast; timezone: string; now: number; isDay: boolean; online: boolean }
export function UvDetails({ forecast, timezone, now, isDay, online }: Props) {
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const { current, hours, peak, peakTime, lowFrom, stale } = forecast;
  const clock = (time: number) => localTime(time, timezone, { hour: 'numeric' });
  const selectedIndex = hours.findIndex(hour => hour.time === selectedTime);
  const currentIndex = hours.findIndex(hour => hour.time <= now / 1000 && hour.time + 3600 > now / 1000);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : Math.max(0, currentIndex);
  const active = hours[activeIndex], reading = uvInfo(active?.uv);
  const hasHourly = hours.some(hour => validUv(hour.uv));
  const scale = Math.max(11, ...hours.flatMap(hour => validUv(hour.uv) ? [hour.uv] : []));
  const detail = active ? `${localTime(active.time, timezone, { hour: 'numeric', timeZoneName: 'short' })} · ${reading ? `UV ${reading.index} · ${reading.level.label}` : 'UV unavailable'}` : '';
  return <section id="uv-details" className="uv-details" aria-labelledby="uv-details-title">
    <div className="uv-heading"><h2 id="uv-details-title">A little sun sense</h2><span>{localTime(now / 1000, timezone, { month: 'short', day: 'numeric' })}</span></div>
    {stale ? <p className="uv-notice">{online ? 'Saved UV forecast. Refresh for current conditions.' : 'Saved UV forecast. Connect and refresh for current conditions.'}</p> : null}
    <UvScale value={current?.index ?? null}/>
    {current ? <p className="uv-tip">{!isDay && current.index === 0 ? 'UV is low at night. Check the daytime forecast before heading out.' : current.level.tip}</p> : !stale ? <p className="uv-notice">Current UV is unavailable. Try refreshing the forecast.</p> : null}
    <p className="uv-peak">{peak ? <>Today’s peak: <strong>UV {peak.index} · {peak.level.label}</strong>{peakTime !== null ? ` around ${clock(peakTime)}` : ''}.</> : 'Today’s peak UV is unavailable.'}</p>
    {lowFrom !== null ? <p className="uv-lower">Low UV forecast from around {clock(lowFrom)}.</p> : null}
    {hasHourly ? <>
      <div className="uv-chart-label"><h3>Today’s hourly UV</h3><span>{Math.ceil(scale)}</span></div>
      <div className="uv-chart">
        <div className="uv-bars" aria-hidden="true">{hours.map((hour, index) => <span key={hour.time} data-uv={uvInfo(hour.uv)?.level.id ?? 'unknown'} className={`uv-column${index === activeIndex ? ' is-selected' : ''}`}>
          <i style={{ height: validUv(hour.uv) ? `${hour.uv / scale * 100}%` : undefined }}/>{!validUv(hour.uv) ? <b>?</b> : null}
        </span>)}</div>
        <input type="range" min="0" max={hours.length - 1} step="1" value={activeIndex} aria-label="UV forecast hour" aria-valuetext={detail}
          onChange={event => { const index = Number(event.target.value); if (index !== activeIndex) { setSelectedTime(hours[index].time); triggerHaptic('selection', true); } }}/>
      </div>
      <div className="uv-times" aria-hidden="true"><span>{clock(hours[0].time)}</span><span>{clock(hours[Math.floor(hours.length / 2)].time)}</span><span>{clock(hours.at(-1)!.time)}</span></div>
      <p className="uv-hour-detail" role="status">{detail}</p><p className="uv-hint">Tap or slide the bars to explore.</p>
    </> : <p className="uv-notice">Hourly UV is unavailable for today.</p>}
    <p className="uv-source">UV is a forecast estimate. <a href="https://www.weather.gov/ilx/uv-index" target="_blank" rel="noreferrer">About UV & sun protection</a></p>
  </section>;
}
