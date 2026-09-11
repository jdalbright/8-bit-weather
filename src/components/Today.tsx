import { useRef, useState } from 'react';
import type { BriefingProvider, Discovery, Place, SceneState, Units, WeatherSnapshot } from '../types';
import { dayLabel, futureDays, localDate, localTime, percent, precipitationForHour, STALE_AFTER, temperature, updatedLabel, weatherInfo, windSpeed } from '../lib/weather';
import { Icon, WeatherIcon } from './Icons';
import { Scenery } from './Scenery';
import { landscapeForPlace } from '../lib/landscapes';
import { upcomingRain } from '../lib/rain';
import { RainOutlook } from './RainOutlook';
import { uvForecast } from '../lib/uv';
import { UvDetails, UvScale } from './UvDetails';
import { WeatherBriefing } from './WeatherBriefing';
import { SunTimes } from './SunTimes';

interface Props {
  briefingProvider?: BriefingProvider; onBriefingProviderChange?: (provider: BriefingProvider) => void;
  place: Place | null; snapshot: WeatherSnapshot | null; scene: SceneState; units: Units; animate: boolean;
  loading: boolean; error: string | null; online: boolean; now: number; locating: boolean;
  onLocate: () => void; onPlaces: () => void; onRefresh: () => void;
  onDiscover: (discovery: Discovery) => void;
}
export default function Today({ briefingProvider, onBriefingProviderChange, place, snapshot, scene, units, animate, loading, error, online, now, locating, onLocate, onPlaces, onRefresh, onDiscover }: Props) {
  const hourlyRef = useRef<HTMLDivElement>(null);
  const [uvExpanded, setUvExpanded] = useState(false);
  const days = snapshot ? futureDays(snapshot.daily, snapshot.timezone, now) : [];
  const todayDate = snapshot ? localDate(now, snapshot.timezone) : '';
  const today = days.find(day => day.date === todayDate);
  const hours = snapshot?.hourly.filter(hour => hour.time + 3600 > now / 1000).slice(0, 24) ?? [];
  const currentHour = snapshot?.hourly.find(hour => hour.time <= now / 1000 && hour.time + 3600 > now / 1000);
  const stale = !!snapshot && (!online || now - snapshot.fetchedAt >= STALE_AFTER || now - snapshot.current.time * 1000 > 3600000);
  const info = weatherInfo(snapshot?.current.code ?? null, scene.isDay);
  const rangeValues = days.flatMap(day => [day.low, day.high]).filter((n): n is number => n !== null);
  const minimum = Math.min(...rangeValues), maximum = Math.max(...rangeValues);
  const span = Math.max(1, maximum - minimum);
  const degree = snapshot ? temperature(snapshot.current.temperature, units) : '—';
  const rainOutlook = snapshot ? upcomingRain(snapshot, now, online) : null;
  const uv = snapshot ? uvForecast(snapshot, now, online) : null;
  return <main id="main-content" tabIndex={-1} className="today-view">
    <Scenery key={snapshot ? place?.id : 'loading'} scene={scene} landscape={landscapeForPlace(place)} animate={animate} onDiscover={onDiscover} className={!place ? 'welcome-scene' : ''}>
      {!place ? <div className="welcome-content">
        <h1>Find your weather</h1>
        <p>A little pixel world.<br/>Your real forecast.</p>
        <button className="pixel-button primary" onClick={onLocate} disabled={locating}><Icon name="location" size={18}/>{locating ? 'Finding you…' : 'Use my location'}</button>
        <button className="text-button city-search-link" onClick={onPlaces}><Icon name="search" size={14}/>Search for a city</button>
      </div> : <div className="current-weather" aria-busy={loading}>
        <button className="pixel-button location-selector" onClick={onPlaces} aria-label={`Change location, ${place.name}`}><span>{place.name}{place.region === 'North Carolina' ? ', NC' : ''}</span><Icon name="chevron" size={16}/></button>
        <div className="weather-date">{snapshot ? localTime((stale ? snapshot.current.time : now / 1000), snapshot.timezone, { weekday: 'short', month: 'short', day: 'numeric' }) : 'YOUR FORECAST IS ON ITS WAY'}</div>
        <h1 className="current-temperature" aria-label={snapshot?.current.temperature == null ? 'Temperature unavailable' : `${degree} ${units === 'imperial' ? 'Fahrenheit' : 'Celsius'}`}><span>{degree.replace('°', '')}</span>{degree.includes('°') ? <sup>°</sup> : null}</h1>
        <p className="condition">{snapshot ? info.label : loading ? 'Gathering the forecast…' : 'Forecast unavailable'}</p>
        {snapshot ? <p className="feels-like">Feels like {temperature(snapshot.current.feelsLike, units)}<span aria-hidden="true"> · </span>H {temperature(today?.high, units)} / L {temperature(today?.low, units)}</p> : null}
        {stale ? <p className="saved-observation">Saved forecast · {localTime(snapshot!.current.time, snapshot!.timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p> : null}
      </div>}
    </Scenery>
    {error ? <div className="notice error-notice" role="alert"><p>{error}</p>{place ? <button className="text-button" onClick={onRefresh} disabled={loading || !online}>Try again <Icon name="refresh" size={14}/></button> : null}</div> : null}
    {snapshot ? <>
      {stale ? <div className="offline-notice" role="status">{!online ? 'You’re offline. Showing your saved forecast.' : 'This forecast is getting old. Refresh for the latest.'}</div> : null}
      <dl className="current-stats">
        <div><Icon name="drop" className="rain-stat" size={25}/><span><dt>{info.kind === 'snow' ? 'Snow' : 'Rain'}</dt><dd>{percent(precipitationForHour(snapshot.hourly, currentHour?.time))}</dd></span></div>
        <div><Icon name="wind" className="wind-stat" size={25}/><span><dt>Wind</dt><dd>{windSpeed(snapshot.current.wind, units)}</dd></span></div>
        <div><Icon name="drop" className="humidity-stat" size={25}/><span><dt>Humidity</dt><dd>{percent(snapshot.current.humidity)}</dd></span></div>
        <div className="uv-stat"><dt className="sr-only">UV index</dt><dd><button className="uv-stat-button" aria-label={`UV index ${uv?.current ? `${uv.current.index}, ${uv.current.level.label}` : 'unavailable'}, ${uvExpanded ? 'hide' : 'show'} details`}
          aria-expanded={uvExpanded} aria-controls="uv-details" onClick={() => setUvExpanded(expanded => !expanded)} data-uv={uv?.current?.level.id ?? 'unknown'}>
          <WeatherIcon kind="clear" size={25}/><span className="uv-stat-copy"><span className="uv-stat-label">UV index</span><span className="uv-stat-reading">{uv?.current?.index ?? '—'} <small>{uv?.current?.level.label ?? (uv?.stale ? 'Saved' : 'Unavailable')}</small></span><UvScale value={uv?.current?.index ?? null} compact/></span><Icon name="chevron" size={12}/>
        </button></dd></div>
      </dl>
      {uv ? <div className="uv-disclosure" data-expanded={uvExpanded} data-animate={animate} aria-hidden={!uvExpanded} inert={!uvExpanded}>
        <div className="uv-disclosure-content"><UvDetails key={`${snapshot.placeId}:${uv.today}`} forecast={uv} timezone={snapshot.timezone} now={now} isDay={scene.isDay} online={online}/></div>
      </div> : null}
      {rainOutlook ? <RainOutlook key={snapshot.placeId} outlook={rainOutlook} timezone={snapshot.timezone} units={units} now={now}/> : null}
      <WeatherBriefing provider={briefingProvider} onProviderChange={onBriefingProviderChange} snapshot={snapshot} units={units} online={online} now={now}/>
      <section className="hourly-section" aria-labelledby="hourly-title">
        <div className="section-heading"><h2 id="hourly-title">Next 24 hours</h2><button className="icon-button scroll-hours" aria-label="Scroll hourly forecast forward" onClick={() => hourlyRef.current?.scrollBy({ left: 220, behavior: animate ? 'smooth' : 'instant' })}><Icon name="next" size={17}/></button></div>
        {hours.length ? <div ref={hourlyRef} className="hourly-rail" data-pull-refresh-ignore tabIndex={0} aria-label="Hourly forecast, scroll for more hours">
          {hours.map(hour => { const isCurrentHour = hour.time <= now / 1000 && hour.time + 3600 > now / 1000;
            const useCurrent = isCurrentHour && !stale;
            return <div className="hour" key={hour.time}>
            <span className="hour-label">{isCurrentHour ? 'Now' : localTime(hour.time, snapshot.timezone, { hour: 'numeric' })}</span>
            <WeatherIcon kind={weatherInfo(useCurrent ? snapshot.current.code : hour.code).kind} isDay={useCurrent ? scene.isDay : hour.isDay} size={30}/><span className="sr-only">{weatherInfo(useCurrent ? snapshot.current.code : hour.code, useCurrent ? scene.isDay : hour.isDay).label}</span>
            <span className="hour-temperature">{temperature(useCurrent ? snapshot.current.temperature : hour.temperature, units)}</span>
            <span className="hour-precipitation"><Icon name="drop" size={10}/><span className="sr-only">Chance of precipitation: </span>{percent(precipitationForHour(snapshot.hourly, hour.time))}</span>
          </div>; })}</div> : <p className="empty-forecast">This hourly forecast has expired. Connect and refresh for the next 24 hours.</p>}
      </section>
      <SunTimes day={today} timezone={snapshot.timezone}/>
      <section className="daily-section" aria-labelledby="daily-title">
        <div className="section-heading"><h2 id="daily-title">7-day forecast</h2></div>
        {days.length ? <div className="daily-list">{days.map(day => {
          const start = day.low !== null ? (day.low - minimum) / span * 100 : 0;
          const width = day.low !== null && day.high !== null ? Math.max(3, (day.high - day.low) / span * 100) : 0;
          const isToday = day.date === todayDate;
          return <div className="day-row" key={day.date}>
            <span className="day-name">{isToday ? 'Today' : dayLabel(day.date)}</span>
            <span className="day-icon" title={weatherInfo(day.code).label}><WeatherIcon kind={weatherInfo(day.code).kind} size={25}/><span className="sr-only">{weatherInfo(day.code).label}</span></span>
            <span className="day-precipitation"><Icon name="drop" size={10}/><span className="sr-only">Chance of precipitation: </span>{percent(day.precipitation)}</span>
            <span className="day-low" aria-label={`Low ${temperature(day.low, units)}`}>{temperature(day.low, units)}</span>
            <span className="temperature-range" aria-hidden="true"><span className="temperature-bar" style={{ left: `${start}%`, width: `${width}%` }}/>{isToday && snapshot.current.temperature !== null && width ? <i style={{ left: `${Math.min(100, Math.max(0, (snapshot.current.temperature - minimum) / span * 100))}%` }}/> : null}</span>
            <span className="day-high" aria-label={`High ${temperature(day.high, units)}`}>{temperature(day.high, units)}</span>
          </div>;
        })}</div> : <p className="empty-forecast">Your saved forecast has expired. Connect and refresh to see the week ahead.</p>}
      </section>
      <footer className="forecast-footer"><div><span>{updatedLabel(snapshot.fetchedAt, now)}</span><span aria-hidden="true"> · </span><button className="text-button" onClick={onRefresh} disabled={loading || !online}>{loading ? 'Refreshing…' : 'Refresh'}</button></div><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo</a></footer>
    </> : !place ? <section className="welcome-footer"><WeatherIcon kind="partly-cloudy" size={32}/><p>A forecast worth slowing down for.</p><span>Free weather. Cozy sounds. A sky that’s yours.</span></section> : null}
  </main>;
}
