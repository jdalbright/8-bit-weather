import { triggerHaptic } from '../lib/native-experience';
import { useState } from 'react';
import type { Units } from '../types';
import { rainAmount, RAIN_INTERVAL, type RainOutlookData } from '../lib/rain';
import { localTime } from '../lib/weather';
import { WeatherIcon } from './Icons';

interface Props { outlook: RainOutlookData; timezone: string; units: Units; now: number }
export function RainOutlook({ outlook, timezone, units, now }: Props) {
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const { periods, firstRainIndex } = outlook;
  const selectedIndex = periods.findIndex(period => period.time === selectedTime);
  const activeIndex = selectedIndex < 0 ? firstRainIndex : selectedIndex;
  const active = periods[activeIndex];
  const clock = (time: number) => localTime(time, timezone, { hour: 'numeric', minute: '2-digit' });
  const firstStart = periods[firstRainIndex].time - RAIN_INTERVAL;
  const summary = firstStart <= now / 1000 ? 'Rain forecast in the next two hours' : `Rain possible around ${clock(firstStart)}`;
  const detail = `${clock(active.time - RAIN_INTERVAL)}–${clock(active.time)} · ${rainAmount(active.amount, units)} of rain`;
  const scale = Math.max(1, ...periods.map(period => period.amount));
  return <section className="rain-outlook" aria-labelledby="rain-outlook-title">
    <div className="rain-heading"><h2 id="rain-outlook-title"><WeatherIcon kind="rain" size={25}/>Rain outlook</h2><span>Next 2 hours</span></div>
    <p className="rain-summary">{summary}</p>
    <div className="rain-scale"><span>Rain per 15 min</span><span>{rainAmount(scale, units)}</span></div>
    <div className="rain-chart">
      <div className="rain-bars" aria-hidden="true">{periods.map((period, index) => <span className={`rain-column${index === activeIndex ? ' is-selected' : ''}`} key={period.time}>
        <i style={{ height: `${period.amount > 0 ? Math.max(4, period.amount / scale * 100) : 0}%` }}/>
      </span>)}</div>
      <input type="range" min="0" max={periods.length - 1} step="1" value={activeIndex} aria-label="Rain forecast time" aria-valuetext={detail}
        onChange={event => { const index = Number(event.target.value); if (index !== activeIndex) { setSelectedTime(periods[index].time); triggerHaptic('selection', true); } }}/>
    </div>
    <div className="rain-times" aria-hidden="true"><span>{clock(periods[0].time - RAIN_INTERVAL)}</span><span>{clock(periods[Math.floor(periods.length / 2)].time - RAIN_INTERVAL)}</span><span>{clock(periods.at(-1)!.time)}</span></div>
    <p className="rain-detail" role="status">{detail}</p>
    <p className="rain-hint">Tap or slide the bars to explore.</p>
    <p className="rain-note">Forecast estimate · timing may shift.</p>
  </section>;
}
