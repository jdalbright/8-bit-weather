import { useEffect, useRef, useState } from 'react';
import type { Place } from '../types';
import { searchPlaces } from '../lib/api';
import { Icon, WeatherIcon } from './Icons';

interface Props { places: Place[]; selected: Place | null; locating: boolean; onLocate: () => void; onSelect: (place: Place) => void; onRemove: (id: string) => void }
export default function Places({ places, selected, locating, onLocate, onSelect, onRemove }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setResults([]); setError(null); setSearched(false);
    if (query.trim().length < 3) { setLoading(false); return; }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void searchPlaces(query, controller.signal).then(places => {
        if (!controller.signal.aborted) { setResults(places); setSearched(true); }
      }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'City search is unavailable. Please try again.'); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <main id="main-content" tabIndex={-1} className="utility-view places-view">
    <div className="view-title"><Icon name="places" size={26}/><h1>Places</h1></div>
    <p className="view-intro">A different place. A whole new sky.</p>
    <button className="pixel-button primary full-width" onClick={onLocate} disabled={locating}><Icon name="location"/>{locating ? 'Finding your location…' : 'Use my location'}</button>
    <p className="location-note">Your browser will ask for permission. City search works without it.</p>
    <label className="field-label" htmlFor="city-search">Find a city</label>
    <div className="search-field"><Icon name="search" size={18}/><input ref={input} id="city-search" type="search" autoComplete="off" enterKeyHint="search" placeholder="City or postal code" value={query} onChange={event => setQuery(event.target.value)} />{query ? <button className="icon-button" onClick={() => { setQuery(''); input.current?.focus(); }} aria-label="Clear city search"><Icon name="close" size={15}/></button> : null}</div>
    <div className="search-status" role="status">{loading ? 'Looking for places…' : query.length > 0 && query.trim().length < 3 ? 'Enter at least 3 characters.' : searched && !results.length ? 'No places found. Try a city and country.' : results.length ? `${results.length} ${results.length === 1 ? 'place' : 'places'} found` : ''}</div>
    {error ? <p className="notice error-notice" role="alert">{error}</p> : null}
    {results.length ? <ul className="place-list search-results" aria-label="City search results">{results.map(place => <li key={place.id}><button className="place-select" onClick={() => onSelect(place)}><span><strong>{place.name}</strong><small>{[place.region, place.country].filter(Boolean).join(', ')}</small></span><Icon name="plus" size={16}/></button></li>)}</ul> : null}
    <section className="saved-places" aria-labelledby="saved-title"><div className="section-heading"><h2 id="saved-title">Your places</h2><span className="place-count">{places.length}</span></div>
      {places.length ? <ul className="place-list">{places.map(place => <li key={place.id} className={selected?.id === place.id ? 'selected-place' : ''}><button className="place-select" aria-current={selected?.id === place.id ? 'location' : undefined} onClick={() => onSelect(place)}><Icon name={selected?.id === place.id ? 'check' : 'places'} size={20}/><span><strong>{place.name}</strong><small>{[place.region, place.country].filter(Boolean).join(', ')}</small></span></button><button className="icon-button remove-place" aria-label={`Remove ${place.name} from saved places`} onClick={() => onRemove(place.id)}><Icon name="trash" size={17}/></button></li>)}</ul> : <div className="places-empty"><WeatherIcon kind="partly-cloudy" size={48}/><p>Your favorite skies belong here.</p><span>Choose a city above to save it for next time.</span></div>}
    </section>
    <p className="fine-print">Saved on this device. Location search by <a href="https://open-meteo.com/en/docs/geocoding-api" target="_blank" rel="noreferrer">Open-Meteo</a> and <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a>.</p>
  </main>;
}
