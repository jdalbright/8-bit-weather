import { useRef, useState } from 'react';
import type { BriefingProvider, Discovery, HourWeather, Place, SceneState, Units, WeatherSnapshot } from '../types';
import { dayLabel, futureDays, localDate, localTime, percent, precipitationForHour, STALE_AFTER, temperature, updatedLabel, weatherInfo, windSpeed } from '../lib/weather';
import { Icon, WeatherIcon } from './Icons';
import { Scenery } from './Scenery';
import { landscapeForPlace } from '../lib/landscapes';
import { upcomingRain } from '../lib/rain';
import { RainOutlook } from './RainOutlook';
import { uvForecast } from '../lib/uv';
import { UvDetails } from './UvDetails';
import { WeatherBriefing } from './WeatherBriefing';
import { SunTimes } from './SunTimes';
import { ForecastTimeTravel } from './ForecastTimeTravel';
import { forecastHours, forecastTimeLabel } from '../lib/forecast-preview';
import { triggerHaptic } from '../lib/native-experience';
import { useHourlyScrollHaptics } from '../hooks/useHourlyScrollHaptics';

interface Props {
  previewHour?: HourWeather | null; previewScene?: SceneState | null; onSelectForecast?: (time: number | null) => void;
  briefingProvider?: BriefingProvider; onBriefingProviderChange?: (provider: BriefingProvider) => void;
  place: Place | null; snapshot: WeatherSnapshot | null; scene: SceneState; units: Units; animate: boolean; decorativeAnimate?: boolean;
  loading: boolean; error: string | null; online: boolean; now: number; locating: boolean;
  onRadar?: () => void; onLocate: () => void; onPlaces: () => void; onRefresh: () => void;
  onDiscover: (discovery: Discovery) => void;
}
export default function Today({ previewHour = null, previewScene = null, onSelectForecast, briefingProvider, onBriefingProviderChange, place, snapshot, scene, units, animate, decorativeAnimate = animate, loading, error, online, now, locating, onRadar, onLocate, onPlaces, onRefresh, onDiscover }: Props) {
  const displayScene = previewScene ?? scene;
  const hourlyRef = useRef<HTMLDivElement>(null);
  const [uvExpanded, setUvExpanded] = useState(false);
  const days = snapshot ? futureDays(snapshot.daily, snapshot.timezone, now) : [];
  const todayDate = snapshot ? localDate(now, snapshot.timezone) : '';
  const today = days.find(day => day.date === todayDate);
  const hours = forecastHours(snapshot, now);
  const beginHourlyScroll = useHourlyScrollHaptics(hourlyRef, `${place?.id}:${place?.latitude}:${place?.longitude}:${hours[0]?.time}`);
  const futureHours = hours.filter(hour => hour.time > now / 1000);
  const currentHour = snapshot?.hourly.find(hour => hour.time <= now / 1000 && hour.time + 3600 > now / 1000);
  const stale = !!snapshot && (!online || now < snapshot.fetchedAt || now - snapshot.fetchedAt >= STALE_AFTER || now - snapshot.current.time * 1000 > 3600000);
  const info = weatherInfo(snapshot?.current.code ?? null, scene.isDay);
  const rangeValues = days.flatMap(day => [day.low, day.high]).filter((n): n is number => n !== null);
  const minimum = Math.min(...rangeValues), maximum = Math.max(...rangeValues);
  const span = Math.max(1, maximum - minimum);
  const displayTemperature = previewHour ? previewHour.temperature : snapshot?.current.temperature;
  const degree = temperature(displayTemperature, units);
  const displayInfo = previewHour ? weatherInfo(previewHour.code, displayScene.isDay) : info;
  const rainOutlook = snapshot ? upcomingRain(snapshot, now, online) : null;
  const uv = snapshot ? uvForecast(snapshot, now, online) : null;
  const [currentWind, currentWindUnit] = windSpeed(snapshot?.current.wind ?? null, units).split(' ');
  return <main id="main-content" tabIndex={-1} className="today-view">
    <div className="forecast-scene" data-preview={!!previewHour}>
    <Scenery key={snapshot ? `${place?.id}:${place?.latitude}:${place?.longitude}` : 'loading'} scene={displayScene} landscape={landscapeForPlace(place)} animate={decorativeAnimate} onDiscover={onDiscover} className={!place ? 'welcome-scene' : ''}>
      {!place ? <div className="welcome-content">
        <h1>Find your weather</h1>
        <p>A little pixel world.<br/>Your real forecast.</p>
        <button className="pixel-button primary" onClick={onLocate} disabled={locating}><Icon name="location" size={18}/>{locating ? 'Finding you…' : 'Use my location'}</button>
        <button className="text-button city-search-link" onClick={onPlaces}><Icon name="search" size={14}/>Search for a city</button>
      </div> : <div className="current-weather" aria-busy={loading}>
        <button className="pixel-button location-selector" onClick={onPlaces} aria-label={`Change location, ${place.name}`}><span>{place.name}{place.region === 'North Carolina' ? ', NC' : ''}</span><Icon name="chevron" size={16}/></button>
        {previewHour ? <p className="forecast-preview-badge">{stale ? 'Saved forecast preview' : 'Forecast preview'}</p> : null}
        <div className="weather-date">{previewHour && snapshot ? forecastTimeLabel(previewHour.time, snapshot.timezone) : snapshot ? localTime((stale ? snapshot.current.time : now / 1000), snapshot.timezone, { weekday: 'short', month: 'short', day: 'numeric' }) : 'YOUR FORECAST IS ON ITS WAY'}</div>
        <h1 className="current-temperature" aria-label={displayTemperature == null ? 'Temperature unavailable' : `${degree} ${units === 'imperial' ? 'Fahrenheit' : 'Celsius'}`}><span>{degree.replace('°', '')}</span>{degree.includes('°') ? <sup>°</sup> : null}</h1>
        <p className="condition">{snapshot ? displayInfo.label : loading ? 'Gathering the forecast…' : 'Forecast unavailable'}</p>
        {previewHour && snapshot ? <p className="feels-like">Chance of precipitation: {percent(precipitationForHour(snapshot.hourly, previewHour.time))}</p> : snapshot ? <p className="feels-like">Feels like {temperature(snapshot.current.feelsLike, units)}<span aria-hidden="true"> · </span>H {temperature(today?.high, units)} / L {temperature(today?.low, units)}</p> : null}
        {stale ? <p className="saved-observation">Saved forecast · {localTime(previewHour ? snapshot!.fetchedAt / 1000 : snapshot!.current.time, snapshot!.timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p> : null}
      </div>}
    </Scenery>
    </div>
    {snapshot && futureHours.length > 0 && onSelectForecast ? <ForecastTimeTravel hours={futureHours} selected={previewHour} timezone={snapshot.timezone} onSelect={onSelectForecast}/> : null}
    {error ? <div className="notice error-notice" role="alert"><p>{error}</p>{place ? <button className="text-button" onClick={onRefresh} disabled={loading || !online}>Try again <Icon name="refresh" size={14}/></button> : null}</div> : null}
    {snapshot ? <>
      {stale ? <div className="offline-notice" role="status">{!online ? 'You’re offline. Showing your saved forecast.' : 'This forecast is getting old. Refresh for the latest.'}</div> : null}
      <h2 className="current-conditions-title">Current conditions</h2>
      <dl className="current-stats" aria-label="Current conditions">
        <div><dt><Icon name="drop" className="rain-stat" size={24}/><span aria-hidden="true">Precip chance</span><span className="sr-only">Chance of precipitation this hour</span></dt><dd>{percent(precipitationForHour(snapshot.hourly, currentHour?.time))}<span className="stat-context" aria-hidden="true">This hour</span></dd></div>
        <div className="stat-simple"><dt><Icon name="wind" className="wind-stat" size={24}/><span>Wind</span></dt><dd>{currentWind}{currentWindUnit ? <> <small className="stat-unit">{currentWindUnit}</small></> : null}</dd></div>
        <div className="stat-simple"><dt><Icon name="drop" className="humidity-stat" size={24}/><span>Humidity</span></dt><dd>{percent(snapshot.current.humidity)}</dd></div>
        <div className="uv-stat"><dt className="sr-only">UV index</dt><dd><button className="uv-stat-button" aria-label={`UV index ${uv?.current ? `${uv.current.index}, ${uv.current.level.label}` : 'unavailable'}, ${uvExpanded ? 'hide' : 'show'} details`}
          aria-expanded={uvExpanded} aria-controls="uv-details" onClick={() => setUvExpanded(expanded => !expanded)} data-uv={uv?.current?.level.id ?? 'unknown'}>
          <WeatherIcon kind="clear" size={24}/><span className="uv-stat-copy"><span className="uv-stat-label">UV index</span><span className="uv-stat-reading"><span>{uv?.current?.index ?? '—'}</span> <small>{uv?.current?.level.label ?? (uv?.stale ? 'Saved' : 'Unavailable')}</small></span><span className="uv-stat-action">{uvExpanded ? 'Hide details' : 'Details'}<Icon name="chevron" size={12}/></span></span>
        </button></dd></div>
      </dl>
      {uv ? <div className="uv-disclosure" data-expanded={uvExpanded} data-animate={animate} aria-hidden={!uvExpanded} inert={!uvExpanded}>
        <div className="uv-disclosure-content"><UvDetails key={`${snapshot.placeId}:${uv.today}`} forecast={uv} timezone={snapshot.timezone} now={now} isDay={scene.isDay} online={online}/></div>
      </div> : null}
      {rainOutlook ? <RainOutlook key={snapshot.placeId} onRadar={onRadar} outlook={rainOutlook} timezone={snapshot.timezone} units={units} now={now}/> : null}
      <WeatherBriefing provider={briefingProvider} onProviderChange={onBriefingProviderChange} snapshot={snapshot} units={units} online={online} now={now}/>
      <section className="hourly-section" aria-labelledby="hourly-title">
        <div className="section-heading"><h2 id="hourly-title">Next 24 hours</h2><button className="icon-button scroll-hours" aria-label="Scroll hourly forecast forward" onClick={() => { beginHourlyScroll(); hourlyRef.current?.scrollBy({ left: 220, behavior: animate ? 'smooth' : 'instant' }); }}><Icon name="next" size={17}/></button></div>
        {hours.length ? <div ref={hourlyRef} className="hourly-rail" data-pull-refresh-ignore tabIndex={0} aria-label="Hourly forecast, scroll for more hours">
          {hours.map(hour => { const isCurrentHour = hour.time <= now / 1000 && hour.time + 3600 > now / 1000;
            const useCurrent = isCurrentHour && !stale;
            return <button className="hour" key={hour.time} type="button"
              aria-pressed={previewHour ? previewHour.time === hour.time : isCurrentHour}
              aria-label={`${isCurrentHour ? 'Now' : forecastTimeLabel(hour.time, snapshot.timezone)}, ${weatherInfo(useCurrent ? snapshot.current.code : hour.code, useCurrent ? scene.isDay : hour.isDay).label}, ${temperature(useCurrent ? snapshot.current.temperature : hour.temperature, units)}, Chance of precipitation: ${percent(precipitationForHour(snapshot.hourly, hour.time))}`}
              onClick={() => { const time = isCurrentHour ? null : hour.time; if (onSelectForecast && time !== (previewHour?.time ?? null)) triggerHaptic('selection'); onSelectForecast?.(time); }}>
            <span className="hour-label">{isCurrentHour ? 'Now' : localTime(hour.time, snapshot.timezone, { hour: 'numeric' })}</span>
            <WeatherIcon kind={weatherInfo(useCurrent ? snapshot.current.code : hour.code).kind} isDay={useCurrent ? scene.isDay : hour.isDay} size={30}/><span className="sr-only">{weatherInfo(useCurrent ? snapshot.current.code : hour.code, useCurrent ? scene.isDay : hour.isDay).label}</span>
            <span className="hour-temperature">{temperature(useCurrent ? snapshot.current.temperature : hour.temperature, units)}</span>
            <span className="hour-precipitation"><Icon name="drop" size={10}/><span className="sr-only">Chance of precipitation: </span>{percent(precipitationForHour(snapshot.hourly, hour.time))}</span>
          </button>; })}</div> : <p className="empty-forecast">This hourly forecast has expired. Connect and refresh for the next 24 hours.</p>}
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
