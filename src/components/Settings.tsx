import { useState } from 'react';
import type { Preferences } from '../types';
import type { useAudio } from '../hooks/useAudio';
import type { useInstall } from '../hooks/useInstall';
import { useAppleAvailability } from '../hooks/useAppleAvailability';
import { appleUnavailableMessage } from '../lib/apple-briefing';
import { setHapticsEnabled, triggerHaptic, type PowerState } from '../lib/native-experience';
import { Icon } from './Icons';

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <button className="switch-button" role="switch" aria-label={label} aria-checked={checked} onClick={onChange}><span className="switch-track"><span /></span></button>;
}
interface Props { preferences: Preferences; onChange: (preferences: Preferences) => void; audio: ReturnType<typeof useAudio>; install: ReturnType<typeof useInstall>; systemReduced: boolean; power?: PowerState & { savingPower: boolean }; onClear: () => void }
export default function Settings({ preferences, onChange, audio, install, systemReduced, power, onClear }: Props) {
  const apple = useAppleAvailability(install.native);
  const [confirmClear, setConfirmClear] = useState(false);
  const change = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    if (preferences[key] === value) return;
    if (key === 'haptics') { if (!value) setHapticsEnabled(false); }
    else if (key.endsWith('Volume')) {
      const previous = Math.round(Number(preferences[key]) * 100), next = Math.round(Number(value) * 100);
      const endpoint = next === 0 || next === 100;
      if (endpoint || Math.floor(previous / 10) !== Math.floor(next / 10)) triggerHaptic('selection', !endpoint);
    } else triggerHaptic('selection');
    onChange({ ...preferences, [key]: value });
  };
  return <main id="main-content" tabIndex={-1} className="utility-view settings-view">
    <div className="view-title"><Icon name="settings" size={26}/><h1>Settings</h1></div><p className="view-intro">Make yourself at home.</p>
    <section className="settings-section" aria-labelledby="units-title"><h2 id="units-title">Weather units</h2><div className="segmented-control" role="group" aria-label="Weather units"><button aria-pressed={preferences.units === 'imperial'} onClick={() => change('units', 'imperial')}>°F / mph</button><button aria-pressed={preferences.units === 'metric'} onClick={() => change('units', 'metric')}>°C / km/h</button></div></section>
    {install.native ? <section className="settings-section" aria-labelledby="briefing-provider-title">
      <h2 id="briefing-provider-title">Weather briefing</h2>
      <div className="briefing-provider-options" role="group" aria-label="Briefing provider">
        <button className="pixel-button" aria-pressed={preferences.briefingProvider === 'openai'} onClick={() => change('briefingProvider', 'openai')}>{preferences.briefingProvider === 'openai' ? <Icon name="check" size={16}/> : null}OpenAI<span>Requires internet</span></button>
        <button className="pixel-button" aria-pressed={preferences.briefingProvider === 'apple'} disabled={!apple?.available} aria-describedby="apple-briefing-availability" onClick={() => change('briefingProvider', 'apple')}>{preferences.briefingProvider === 'apple' ? <Icon name="check" size={16}/> : null}Apple Intelligence<span>Generated on this device</span></button>
      </div>
      <p id="apple-briefing-availability" className="settings-description" role="status">{!apple ? 'Checking Apple Intelligence availability…' : apple.available ? 'Apple Intelligence is ready. On-device briefings require iOS 27 or later.' : appleUnavailableMessage(apple.reason)}</p>
      <p className="settings-description">Your choice is saved. If a briefing cannot be generated, you can retry or choose the other provider. Providers never switch automatically.</p>
    </section> : null}
    <section className="settings-section" aria-labelledby="sound-title"><div className="settings-title-row"><h2 id="sound-title">A little atmosphere</h2><button className="pixel-button small" aria-pressed={audio.enabled} onClick={() => void audio.toggle()}><Icon name={audio.enabled ? 'sound' : 'muted'} size={16}/>{audio.enabled ? 'Sound on' : 'Sound off'}</button></div>
      <p className="settings-description">Original chiptunes for whatever the sky brings. Sound pauses when you leave the app.</p>
      {(['music', 'ambience', 'effects'] as const).map(channel => {
        const label = { music: 'Music', ambience: 'Weather ambience', effects: 'Interface sounds' }[channel];
        const description = { music: 'Gentle melodies that follow the weather.', ambience: 'Rain, wind, birds, and quiet nights.', effects: 'Small sounds for little moments.' }[channel];
        const volumeKey = `${channel}Volume` as const;
        return <div className="audio-channel" key={channel}><div className="setting-row"><span><strong>{label}</strong><small>{description}</small></span><Toggle label={label} checked={preferences[channel]} onChange={() => change(channel, !preferences[channel])}/></div><label className="volume-control"><span className="sr-only">{label} volume</span><Icon name="sound" size={15}/><input type="range" aria-label={`${label} volume`} min="0" max="100" step="1" value={Math.round(preferences[volumeKey] * 100)} onChange={event => change(volumeKey, Number(event.target.value) / 100)} disabled={!preferences[channel]}/><output>{Math.round(preferences[volumeKey] * 100)}%</output></label></div>;
      })}
      <div className={`now-playing ${audio.playing && preferences.music ? 'is-playing' : ''}`}><span className="equalizer" aria-hidden="true"><i/><i/><i/><i/></span><span>{audio.playing && preferences.music ? audio.trackName : 'A soundtrack for your sky'}</span></div>
    </section>
    {install.native ? <section className="settings-section" aria-labelledby="haptics-title"><h2 id="haptics-title">Touch feedback</h2><div className="setting-row"><span><strong>Haptic feedback</strong><small>Taps for controls, action results, and little scene discoveries.</small></span><Toggle label="Haptic feedback" checked={preferences.haptics} onChange={() => change('haptics', !preferences.haptics)}/></div></section> : null}
    <section className="settings-section" aria-labelledby="motion-title"><h2 id="motion-title">Motion</h2>{install.native && power?.savingPower ? <p className="settings-description" role="status">{power.thermalState === 'serious' || power.thermalState === 'critical' ? 'Decorative animation is paused to help your iPhone cool down.' : 'Decorative animation is paused while Low Power Mode is on.'}</p> : null}<div className="setting-row"><span><strong>Reduce animation</strong><small>A quieter sky, with the same forecast.</small></span><Toggle label="Reduce animation" checked={preferences.reducedMotion} onChange={() => change('reducedMotion', !preferences.reducedMotion)}/></div>{systemReduced ? <p className="settings-description">Your device’s reduced motion setting is already being respected.</p> : null}<p className="settings-description">A couple of little discoveries: tap the river for a ripple, or the weather station for a light. Their sounds follow your interface sounds setting.</p></section>
    {!install.native ? <section className="settings-section" aria-labelledby="install-title"><h2 id="install-title">A home for your weather</h2><p className="settings-description">Add 8-Bit Weather to your home screen. Your last forecast stays with you offline.</p><button className="pixel-button full-width" disabled={install.installed} onClick={() => void install.install()}><Icon name={install.installed ? 'check' : 'download'} size={18}/>{install.installed ? 'App installed' : install.canPrompt ? 'Install app' : 'How to install'}</button>
      {install.showHelp ? <div className="install-help" role="status"><strong>{install.ios ? 'On your iPhone or iPad' : 'From your browser'}</strong>{install.ios ? <ol><li>Open this page in Safari.</li><li>Tap Share, then Add to Home Screen.</li><li>Tap Add to keep your little pixel world.</li></ol> : <p>Open your browser’s menu and choose Install app or Add to Home Screen. In Safari on Mac, use File → Add to Dock.</p>}<p className="fine-print">Phone installation needs an HTTPS address. A local network HTTP address won’t enable installation or location access.</p></div> : null}
      {install.error ? <p role="alert" className="error-text">{install.error}</p> : null}
    </section> : null}
    <section className="settings-section" aria-labelledby="data-title"><h2 id="data-title">Your device, your data</h2><p className="settings-description">Places, preferences, forecasts, and saved briefings stay {install.native ? 'on this device' : 'in this browser'}. Coordinates are sent to Open-Meteo to get your forecast. Opening Radar requests imagery for the viewed map area from NOAA and OpenFreeMap. {install.native ? 'Only your selected provider generates new briefings. Apple Intelligence runs on this device. Choosing OpenAI sends forecast facts to OpenAI when online, without your coordinates or saved place names. Providers never switch automatically.' : 'Forecast data is sent to OpenAI to write your briefing, without your coordinates or saved place names.'} No account or analytics.</p>
      {!confirmClear ? <button className="text-button danger-button" onClick={() => { triggerHaptic({ kind: 'notification', type: 'warning' }); setConfirmClear(true); }}><Icon name="trash" size={16}/>Clear saved data</button> : <div className="clear-confirmation"><p>Clear saved places, forecasts, briefings, and settings from this device?</p><div><button className="pixel-button small" onClick={() => setConfirmClear(false)}>Keep my data</button><button className="pixel-button small danger" onClick={onClear}>Clear everything</button></div></div>}
    </section>
    <footer className="settings-footer"><strong>8-BIT WEATHER</strong><p>A little pixel world. Your real weather.</p><span>Version 1.1.0 · Free & noncommercial</span><p><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather by Open-Meteo</a> · <a href="https://open-meteo.com/en/terms" target="_blank" rel="noreferrer">Data & privacy</a></p>
      <p>Raleigh birds by <a href="https://pop-shop-packs.itch.io/garden-birds-pixel-character-asset-pack" target="_blank" rel="noreferrer">Pop Shop Packs</a> · Leaves by <a href="https://rs-pixel-store.itch.io/falling-leaf-fx" target="_blank" rel="noreferrer">EdgeLoopRepeat</a> · <a href="/art/raleigh-wildlife/credits.txt" target="_blank" rel="noreferrer">Artwork licenses</a></p>
    </footer>
  </main>;
}
