import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Today from './components/Today';
import Places from './components/Places';
import Settings from './components/Settings';
import { PullToRefresh } from './components/PullToRefresh';
import { Icon, WeatherIcon } from './components/Icons';
import { useWeather } from './hooks/useWeather';
import { useAudio } from './hooks/useAudio';
import { useMotion } from './hooks/useMotion';
import { useInstall } from './hooks/useInstall';
import { clearSavedData, defaultPreferences, loadState, saveState } from './lib/storage';
import { locate } from './lib/api';
import { deriveScene } from './lib/scene';
import type { Place, View } from './types';

const navigation: { view: View; label: string; icon: 'home' | 'places' | 'settings' }[] = [{ view: 'today', label: 'Today', icon: 'home' }, { view: 'places', label: 'Places', icon: 'places' }, { view: 'settings', label: 'Settings', icon: 'settings' }];
export default function App() {
  const [initial] = useState(loadState);
  const [preferences, setPreferences] = useState(initial.preferences);
  const [places, setPlaces] = useState(initial.places);
  const [place, setPlace] = useState(initial.selected);
  const [view, setView] = useState<View>('today');
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const locationRequest = useRef(0);
  const focusMain = useRef(false);
  const shell = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (focusMain.current) { shell.current?.querySelector<HTMLElement>('main')?.focus({ preventScroll: true }); focusMain.current = false; }
  }, [view, place]);
  const weather = useWeather(place);
  const motion = useMotion(preferences.reducedMotion);
  const scene = deriveScene(weather.snapshot, weather.now, weather.online);
  const audio = useAudio(preferences, scene);
  const install = useInstall();
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  useEffect(() => { setStorageUnavailable(!saveState({ preferences, places, selected: place })); }, [preferences, places, place]);
  useEffect(() => { document.title = place ? `${place.name} · 8-Bit Weather` : '8-Bit Weather'; }, [place]);
  useEffect(() => () => { locationRequest.current++; }, []);
  function navigate(next: View) {
    focusMain.current = next !== view;
    audio.effect(); setView(next); setNotice(null); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function choosePlace(next: Place) {
    focusMain.current = true;
    locationRequest.current++; setLocating(false); setPlace(next); setView('today'); setNotice(null);
    if (next.source === 'search') setPlaces(current => current.some(saved => saved.id === next.id) ? current : [...current, next]);
    audio.effect('success'); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function handleLocate() {
    const attempt = ++locationRequest.current;
    setLocating(true); setNotice(null); audio.effect();
    try { const found = await locate(); if (attempt === locationRequest.current) choosePlace(found); }
    catch (error) { if (attempt === locationRequest.current) setNotice(error instanceof Error ? error.message : 'Couldn’t find your location. Search for a city instead.'); }
    finally { if (attempt === locationRequest.current) setLocating(false); }
  }
  function clearData() {
    focusMain.current = true;
    locationRequest.current++; audio.stop(); clearSavedData(); setPlaces([]); setPlace(null); setPreferences(defaultPreferences()); setView('today'); setLocating(false); setNotice('Saved places, forecasts, and settings cleared.'); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return <div ref={shell} className={`app-shell ${motion.animate ? '' : 'motion-reduced'}`}>
    <a className="skip-link" href="#main-content">Skip to weather</a>
    <header className="app-header"><button className="brand" onClick={() => navigate('today')} aria-label="8-Bit Weather home"><WeatherIcon kind="clear" size={30}/><span>8-BIT WEATHER</span></button><button className="pixel-button sound-button" aria-pressed={audio.enabled} onClick={() => void audio.toggle()}><Icon name={audio.enabled ? 'sound' : 'muted'} size={17}/>{audio.enabled ? 'Sound on' : 'Sound off'}</button></header>
    {needRefresh ? <div className="update-notice" role="status"><span>A fresh version is ready.</span><button className="text-button" onClick={() => void updateServiceWorker(true)}>Update app</button><button className="icon-button" aria-label="Dismiss update" onClick={() => setNeedRefresh(false)}><Icon name="close" size={14}/></button></div> : null}
    {notice || audio.error ? <div className="app-notice" role="alert"><span>{notice ?? audio.error}</span>{notice ? <button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice(null)}><Icon name="close" size={14}/></button> : null}</div> : null}
    {storageUnavailable ? <p className="offline-notice" role="status">Browser storage is unavailable. Your choices will last for this visit.</p> : null}
    {view === 'today' ? <PullToRefresh key={place?.id ?? 'welcome'} enabled={!!place} disabled={weather.loading || !weather.online} onRefresh={async () => { audio.effect(); await weather.refresh(true); }}>
      <Today place={place} {...weather} scene={scene} units={preferences.units} animate={motion.animate} locating={locating} onDiscover={audio.effect} onLocate={() => void handleLocate()} onPlaces={() => navigate('places')} onRefresh={() => { audio.effect(); void weather.refresh(true); }}/>
    </PullToRefresh>
      : view === 'places' ? <Places places={places} selected={place} locating={locating} onLocate={() => void handleLocate()} onSelect={choosePlace} onRemove={id => { setPlaces(current => current.filter(saved => saved.id !== id)); audio.effect('remove'); }}/>
      : <Settings preferences={preferences} onChange={setPreferences} audio={audio} install={install} systemReduced={motion.systemReduced} onClear={clearData}/>}
    <nav className="bottom-nav" aria-label="Main navigation">{navigation.map(item => <button key={item.view} aria-current={view === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}><Icon name={item.icon} size={24}/><span>{item.label}</span></button>)}</nav>
  </div>;
}
