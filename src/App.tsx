import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Today from './components/Today';
import Radar from './components/Radar';
import Places from './components/Places';
import Settings from './components/Settings';
import { PullToRefresh } from './components/PullToRefresh';
import { ScrollEdgeFeedback } from './components/ScrollEdgeFeedback';
import { Icon, WeatherIcon } from './components/Icons';
import { useWeather } from './hooks/useWeather';
import { useAudio } from './hooks/useAudio';
import { usePowerState } from './hooks/usePowerState';
import { captureHapticContext, setHapticsEnabled, triggerHaptic } from './lib/native-experience';
import { useMotion } from './hooks/useMotion';
import { useInstall } from './hooks/useInstall';
import { clearSavedData, defaultPreferences, loadState, saveState } from './lib/storage';
import { locate } from './lib/api';
import { deriveHourlyScene, deriveScene } from './lib/scene';
import { resolveForecastSelection, type ForecastSelection } from './lib/forecast-preview';
import { usePreviewAudioScene } from './hooks/usePreviewAudioScene';
import { isNativeApp, NATIVE_PLACE_EVENT, takeLaunchPlaceId } from './lib/native';
import { hasLoadedNativeStorage, PERSISTENCE_ERROR_EVENT } from './lib/persistence';
import { syncWidget } from './lib/widget';
import type { Place, View } from './types';

const WebUpdates = lazy(() => import('./components/WebUpdates'));
const navigation: { view: View; label: string; icon: 'home' | 'radar' | 'places' | 'settings' }[] = [{ view: 'today', label: 'Today', icon: 'home' }, { view: 'radar', label: 'Radar', icon: 'radar' }, { view: 'places', label: 'Places', icon: 'places' }, { view: 'settings', label: 'Settings', icon: 'settings' }];
export default function App() {
  const [initial] = useState(loadState);
  const [preferences, setPreferences] = useState(initial.preferences);
  const [places, setPlaces] = useState(initial.places);
  const [place, setPlace] = useState(initial.selected);
  const [view, setView] = useState<View>('today');
  const [forecastSelection, setForecastSelection] = useState<ForecastSelection | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(document.documentElement.dataset.storageUnavailable === 'true');
  const placeReturn = useRef<'today' | 'radar'>('today');
  const locationRequest = useRef(0);
  const manualPending = useRef(false);
  const interactionContext = useRef({ active: true });
  useLayoutEffect(() => {
    const context = { active: true };
    interactionContext.current = context;
    return () => { context.active = false; };
  }, [view, place]);
  const previousHaptics = useRef(preferences.haptics);
  const focusMain = useRef(false);
  const shell = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (focusMain.current) { shell.current?.querySelector<HTMLElement>('main')?.focus({ preventScroll: true }); focusMain.current = false; }
  }, [view, place]);
  const weather = useWeather(place);
  const power = usePowerState();
  const motion = useMotion(preferences.reducedMotion, power.savingPower);
  const previousView = useRef(view);
  useLayoutEffect(() => {
    const previous = previousView.current;
    previousView.current = view;
    const main = shell.current?.querySelector('main');
    if (previous === view || !motion.animate || !main?.animate) return;
    const direction = navigation.findIndex(item => item.view === view) > navigation.findIndex(item => item.view === previous) ? 1 : -1;
    // Only the incoming screen is live; changing tabs cancels unfinished motion.
    const animation = main.animate([
      { opacity: .4, transform: `translateX(${direction * 12}px)` },
      { opacity: 1, transform: 'translateX(0)' },
    ], { duration: 240, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    return () => animation.cancel();
  }, [view, motion.animate]);
  useEffect(() => {
    setHapticsEnabled(preferences.haptics);
    if (preferences.haptics && !previousHaptics.current) triggerHaptic('selection');
    previousHaptics.current = preferences.haptics;
  }, [preferences.haptics]);
  useEffect(() => () => setHapticsEnabled(false), []);
  const scene = deriveScene(weather.snapshot, weather.now, weather.online);
  const previewHour = view === 'today' ? resolveForecastSelection(forecastSelection, place, weather.snapshot, weather.now) : null;
  const previewScene = useMemo(() => weather.snapshot && previewHour ? deriveHourlyScene(weather.snapshot, previewHour) : null, [weather.snapshot, previewHour]);
  useEffect(() => { if (forecastSelection && !previewHour) setForecastSelection(null); }, [forecastSelection, previewHour]);
  const audioScene = usePreviewAudioScene(scene, previewScene, `${place?.id}:${place?.latitude}:${place?.longitude}`);
  const audio = useAudio(preferences, audioScene);
  function selectForecast(time: number | null) {
    setForecastSelection(time !== null && place ? { placeId: place.id, latitude: place.latitude, longitude: place.longitude, time } : null);
  }
  const install = useInstall();
  useEffect(() => {
    const unavailable = () => setStorageUnavailable(true);
    window.addEventListener(PERSISTENCE_ERROR_EVENT, unavailable);
    return () => window.removeEventListener(PERSISTENCE_ERROR_EVENT, unavailable);
  }, []);
  useEffect(() => {
    if (!hasLoadedNativeStorage()) return;
    void syncWidget(place, preferences.units, weather.snapshot).catch(() => setNotice('Your home screen widget could not update. Open the app again to retry.'));
  }, [place, preferences.units, weather.snapshot]);
  useEffect(() => {
    const openPlace = (id: string | null) => {
      const match = id && (places.find(saved => saved.id === id) ?? (place?.id === id ? place : null));
      if (!match) return;
      focusMain.current = true; locationRequest.current++; setLocating(false); setPlace(match); setView('today'); setNotice(null);
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    openPlace(takeLaunchPlaceId());
    const received = () => openPlace(takeLaunchPlaceId());
    window.addEventListener(NATIVE_PLACE_EVENT, received);
    return () => window.removeEventListener(NATIVE_PLACE_EVENT, received);
  }, [places, place]);
  useEffect(() => { setStorageUnavailable(!saveState({ preferences, places, selected: place })); }, [preferences, places, place]);
  useEffect(() => { document.title = place ? `${place.name} · 8-Bit Weather` : '8-Bit Weather'; }, [place]);
  useEffect(() => () => { locationRequest.current++; }, []);
  function navigate(next: View) {
    if (next === 'places' && view !== 'places') placeReturn.current = view === 'radar' ? 'radar' : 'today';
    else if (next !== 'places') placeReturn.current = 'today';
    if (next !== view) triggerHaptic('selection');
    focusMain.current = next !== view;
    audio.effect(); setView(next); setNotice(null); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function choosePlace(next: Place, located = false, feedback = true) {
    const added = next.source === 'search' && !places.some(saved => saved.id === next.id);
    if (feedback) {
      if (added || located) triggerHaptic({ kind: 'notification', type: 'success' });
      else if (!place || next.id !== place.id || next.latitude !== place.latitude || next.longitude !== place.longitude) triggerHaptic('impact');
    }
    focusMain.current = true;
    locationRequest.current++; setLocating(false); setPlace(next); setView(placeReturn.current); setNotice(null);
    if (next.source === 'search') setPlaces(current => current.some(saved => saved.id === next.id) ? current : [...current, next]);
    audio.effect('success'); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function handleLocate() {
    const attempt = ++locationRequest.current;
    const current = captureHapticContext(), context = interactionContext.current;
    const feedback = () => current() && context.active;
    setLocating(true); setNotice(null); audio.effect();
    try { const found = await locate(); if (attempt === locationRequest.current) choosePlace(found, true, feedback()); }
    catch (error) { if (attempt === locationRequest.current) { setNotice(error instanceof Error ? error.message : 'Couldn’t find your location. Search for a city instead.'); if (feedback()) triggerHaptic({ kind: 'notification', type: 'error' }); } }
    finally { if (attempt === locationRequest.current) setLocating(false); }
  }
  async function manualRefresh(source: 'button' | 'pull' = 'button') {
    if (manualPending.current || weather.loading || !weather.online || !place) return;
    manualPending.current = true;
    audio.effect();
    const current = captureHapticContext(), context = interactionContext.current;
    try {
      const outcome = await weather.refresh(true, () => { if (source === 'button') triggerHaptic('impact'); });
      if (current() && context.active && (outcome === 'success' || outcome === 'failure')) {
        triggerHaptic({ kind: 'notification', type: outcome === 'success' ? 'success' : 'error' });
      }
    } finally { manualPending.current = false; }
  }
  function clearData() {
    focusMain.current = true;
    locationRequest.current++; audio.stop(); clearSavedData(); setPlaces([]); setPlace(null); setPreferences(defaultPreferences()); setView('today'); setLocating(false); setNotice('Saved places, forecasts, and settings cleared.'); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return <div ref={shell} className={`app-shell ${motion.animate ? '' : 'motion-reduced'} ${motion.decorativeAnimate ? '' : 'decoration-paused'}`}>
    {!isNativeApp() ? <ScrollEdgeFeedback key={`${view}:${place?.id ?? 'welcome'}`} animate={motion.animate}/> : null}
    <a className="skip-link" href="#main-content">Skip to weather</a>
    <header className="app-header"><button className="brand" onClick={() => navigate('today')} aria-label="8-Bit Weather home"><WeatherIcon kind="clear" size={30}/><span>8-BIT WEATHER</span></button><button className="pixel-button sound-button" aria-pressed={audio.enabled} onClick={() => void audio.toggle()}><Icon name={audio.enabled ? 'sound' : 'muted'} size={17}/>{audio.enabled ? 'Sound on' : 'Sound off'}</button></header>
    {!isNativeApp() ? <Suspense fallback={null}><WebUpdates /></Suspense> : null}
    {notice || audio.error ? <div className="app-notice" role="alert"><span>{notice ?? audio.error}</span>{notice ? <button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice(null)}><Icon name="close" size={14}/></button> : null}</div> : null}
    {storageUnavailable ? <p className="offline-notice" role="status">Saved data is unavailable. Your choices will last for this session.</p> : null}
    <div className="view-transition">
    {view === 'today' ? <PullToRefresh key={place?.id ?? 'welcome'} enabled={!!place} disabled={weather.loading || !weather.online} onRefresh={() => manualRefresh('pull')}>
      <Today previewHour={previewHour} previewScene={previewScene} onSelectForecast={selectForecast} briefingProvider={preferences.briefingProvider} onBriefingProviderChange={briefingProvider => { if (briefingProvider !== preferences.briefingProvider) { triggerHaptic('selection'); setPreferences(previous => ({ ...previous, briefingProvider })); } }} place={place} {...weather} scene={scene} units={preferences.units} animate={motion.animate} decorativeAnimate={motion.decorativeAnimate} locating={locating} onRadar={() => navigate('radar')} onDiscover={audio.effect} onLocate={() => void handleLocate()} onPlaces={() => navigate('places')} onRefresh={() => void manualRefresh()}/>
    </PullToRefresh>
      : view === 'radar' ? <Radar key={`${place?.id}:${place?.latitude}:${place?.longitude}`} place={place} timezone={weather.snapshot?.timezone} now={weather.now} online={weather.online} active={motion.visible} allowPlayback={motion.decorativeAnimate} onPlaces={() => navigate('places')}/>
      : view === 'places' ? <Places places={places} selected={place} locating={locating} onLocate={() => void handleLocate()} onSelect={next => choosePlace(next)} onRemove={id => { if (places.some(saved => saved.id === id)) triggerHaptic('impact'); setPlaces(current => current.filter(saved => saved.id !== id)); audio.effect('remove'); }}/>
      : <Settings preferences={preferences} onChange={setPreferences} audio={audio} install={install} systemReduced={motion.systemReduced} power={power} onClear={clearData}/>}
    </div>
    <nav className="bottom-nav" aria-label="Main navigation" style={{ '--active-tab': navigation.findIndex(item => item.view === view) } as CSSProperties}>{navigation.map(item => <button key={item.view} aria-current={view === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}><span className="nav-icon"><Icon name={item.icon} size={22}/></span><span>{item.label}</span></button>)}</nav>
  </div>;
}
