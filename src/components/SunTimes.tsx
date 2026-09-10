import type { DayWeather } from '../types';
import { localDate, localTime } from '../lib/weather';
import { Icon } from './Icons';

const events = [{ name: 'sunrise', label: 'Sunrise' }, { name: 'sunset', label: 'Sunset' }] as const;

export function SunTimes({ day, timezone }: { day: DayWeather | undefined; timezone: string }) {
  return <section className="sun-section" aria-label="Today's sunrise and sunset">
    <h2>Today’s sun</h2>
    <dl className="sun-times">
    {events.map(({ name, label }) => {
      const timestamp = day?.[name];
      const valid = timestamp != null && Number.isFinite(new Date(timestamp * 1000).getTime())
        && localDate(timestamp * 1000, timezone) === day?.date;
      return <div key={name}>
        <dt><Icon name={name} size={16}/>{label}</dt>
        <dd>{valid ? <time dateTime={new Date(timestamp * 1000).toISOString()}>{localTime(timestamp, timezone, { hour: 'numeric', minute: '2-digit', hour12: true })}</time>
          : <><span aria-hidden="true">—</span><span className="sr-only">Unavailable</span></>}</dd>
      </div>;
    })}
    </dl>
  </section>;
}
