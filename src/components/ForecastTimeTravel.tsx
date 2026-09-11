import { useRef } from 'react';
import type { HourWeather } from '../types';
import { forecastTimeLabel } from '../lib/forecast-preview';

interface Props { hours: HourWeather[]; selected: HourWeather | null; timezone: string; onSelect: (time: number | null) => void }

export function ForecastTimeTravel({ hours, selected, timezone, onSelect }: Props) {
  const slider = useRef<HTMLInputElement>(null);
  const index = selected ? hours.findIndex(hour => hour.time === selected.time) + 1 : 0;
  return <section className="forecast-time-travel" aria-label="Forecast time travel" data-preview={!!selected} data-pull-refresh-ignore>
    <span className="time-travel-label" aria-hidden="true">Preview</span>
    <input ref={slider} type="range" min={0} max={hours.length} step={1} value={Math.max(0, index)} aria-label="Forecast preview time"
      aria-valuetext={selected ? forecastTimeLabel(selected.time, timezone) : 'Now'}
      onChange={event => onSelect(hours[Number(event.target.value) - 1]?.time ?? null)}/>
    <button className="time-travel-now" disabled={!selected} aria-label="Back to now" onClick={() => { onSelect(null); slider.current?.focus({ preventScroll: true }); }}>Now</button>
  </section>;
}
