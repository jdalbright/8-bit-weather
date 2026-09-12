import type { WeatherKind } from '../types';

export type IconName = 'radar' | 'play' | 'pause' | 'home' | 'places' | 'settings' | 'sound' | 'muted' | 'chevron' | 'next' | 'search' | 'location' | 'star' | 'close' | 'check' | 'trash' | 'refresh' | 'download' | 'wind' | 'drop' | 'plus' | 'sunrise' | 'sunset';
const paths: Record<IconName, string> = {
  radar: 'M7 1h10v2h4v4h2v10h-2v4h-4v2H7v-2H3v-4H1V7h2V3h4zm1 3H5v4H4v8h1v3h3v1h8v-1h3v-3h1V8h-1V5h-3V4zM11 6h2v5h5v2h-7zm-4 8h2v3H7zm7 2h3v2h-3z',
  play: 'M5 2h3v2h3v2h3v2h3v2h3v4h-3v2h-3v2h-3v2H8v2H5z',
  pause: 'M5 3h5v18H5zm9 0h5v18h-5z',
  home: 'M2 10h2V8h2V6h2V4h2V2h4v2h2v2h2v2h2v2h2v4h-4v8h-5v-7h-3v7H6v-8H2z',
  places: 'M8 1h8v2h4v4h2v8h-2v3h-2v2h-2v2h-2v2h-4v-2H8v-2H6v-2H4v-3H2V7h2V3h4zm1 6v7h6V7z',
  settings: 'M9 1h6v4h3V3h3v3h-2v3h4v6h-4v3h2v3h-3v-2h-3v4H9v-4H6v2H3v-3h2v-3H1V9h4V6H3V3h3v2h3zm0 8v6h6V9z',
  sound: 'M2 8h5V6h2V4h3V2h2v20h-2v-2H9v-2H7v-2H2zm15-3h2v3h2v8h-2v3h-2v-4h2V9h-2z',
  muted: 'M1 8h4V6h2V4h3V2h2v20h-2v-2H7v-2H5v-2H1zm14-1h2v2h2V7h2v2h-2v2h2v2h-2v2h-2v-2h-2v-2h2V9h-2z',
  chevron: 'M4 8h16v3h-3v3h-3v3h-4v-3H7v-3H4z',
  next: 'M7 3h4v3h3v3h3v6h-3v3h-3v3H7v-4h3v-3h3v-4h-3V7H7z',
  search: 'M5 1h10v2h3v3h2v8h-3v3h2v2h3v3h-4v-3h-3v-2H5v-2H2V4h3zm2 4H6v2H5v5h2v2h6v-2h2V7h-2V5z',
  location: 'M10 0h4v4h5v2h2v4h3v4h-3v5h-2v2h-5v3h-4v-3H5v-2H3v-5H0v-4h3V6h2V4h5zm-3 7v10h10V7zm3 3h4v4h-4z',
  star: 'M10 1h4v5h2v2h7v4h-3v3h-2v7h-4v-3h-4v3H6v-7H4v-3H1V8h7V6h2z',
  close: 'M4 3h3v3h3v3h4V6h3V3h3v4h-3v3h-3v4h3v3h3v4h-3v-3h-3v-3h-4v3H7v3H4v-4h3v-3h3v-4H7V7H4z',
  check: 'M3 11h4v4h3v-3h3V9h3V6h3V3h4v5h-3v3h-3v3h-3v3h-3v4H7v-3H4v-3H1v-4z',
  trash: 'M8 1h8v3h5v3H3V4h5zm-3 8h14v13H5zm3 2v8h2v-8zm6 0v8h2v-8z',
  refresh: 'M7 2h11v3h3V2h3v10H14V9h4V7h-3V5H8v2H5v9h3v3h7v-2h3v-3h3v5h-3v3H6v-3H2V6h3V3h2z',
  download: 'M10 1h4v11h4v3h-3v3h-2v2h-2v-2H9v-3H6v-3h4zM2 18h3v3h14v-3h3v6H2z',
  wind: 'M12 2h6v2h2v5h-2v2H1V8h15V5h-4zm-9 11h16v2h3v5h-3v2h-6v-3h5v-3H3zm-2 5h9v3H1z',
  drop: 'M10 1h4v4h2v3h2v3h2v8h-2v3H6v-3H4v-8h2V8h2V5h2z',
  plus: 'M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8z',
  sunrise: 'M11 0h2v2h2v2h2v2h-4v3h-2V6H7V4h2V2h2zM9 11h6v2h3v3h2v3H4v-3h2v-3h3zM0 21h24v2H0zM0 15h2v3H0zm22 0h2v3h-2zM3 8h2v3H3zm16 0h2v3h-2z',
  sunset: 'M11 0h2v3h4v2h-2v2h-2v2h-2V7H9V5H7V3h4zM9 11h6v2h3v3h2v3H4v-3h2v-3h3zM0 21h24v2H0zM0 15h2v3H0zm22 0h2v3h-2zM3 8h2v3H3zm16 0h2v3h-2z',
};
export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={`pixel-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" shapeRendering="crispEdges"><path d={paths[name]} fillRule="evenodd" /></svg>;
}
function Sun() {
  return <><path fill="#ef941f" d="M10 0h4v4h3V2h3v3h-2v3h3V7h3v4h-4v3h4v3h-4v3h-3v-2h-3v6h-4v-5H7v3H4v-4H1v-4h3v-3H0V7h4V4h3v2h3z" /><path fill="#8b531e" d="M8 4h8v2h3v3h2v7h-2v3h-3v2H8v-2H5v-3H3V9h2V6h3z"/><path fill="#ffdb4d" d="M8 5h8v2h3v3h1v5h-2v3h-3v2H9v-2H6v-3H4v-5h2V7h2z"/><path fill="#fff19a" d="M8 7h7v2H8v3H6v-2h2z"/><path fill="#ffb531" d="M18 10h2v5h-2v3h-3v2H9v-2h6v-2h3z"/><path className="sun-eyes" fill="#a56424" d="M8 11h2v3H8zm6 0h2v3h-2z"/><path fill="#a56424" d="M10 16h4v1h-4z"/></>;
}
function Moon() { return <><path fill="#9187b0" d="M8 2h8v2h-4v4h2v3h3v2h5v5h-3v3H8v-2H5v-3H3V8h2V5h3z"/><path fill="#fff1b4" d="M8 3h5v2h-3v5h2v3h3v2h6v3h-3v2H8v-2H6v-3H4V9h2V6h2z"/><path fill="#d2c591" d="M6 9h3v3H6zm4 6h3v3h-3z"/></>; }
export function Cloud({ dark = false }: { dark?: boolean }) {
  return <><path fill={dark ? '#48546e' : '#514d69'} d="M8 5h9v2h3v3h2v3h2v7H1v-8h3V9h4z"/><path fill={dark ? '#8292b0' : '#fffbea'} d="M9 6h7v2h3v3h2v3h2v4H2v-5h3v-3h4z"/><path fill={dark ? '#65728f' : '#c3bed9'} d="M3 15h4v-2h3v3h8v-3h3v2h2v3H3z"/><path fill={dark ? '#a5aec1' : '#fffef4'} d="M10 7h5v2h3v2h-8z"/></>;
}
export function SceneCloud({ dark = false }: { dark?: boolean }) {
  return <><path fill={dark ? '#666d92' : '#fff4dc'} d="M0 24h60v-6h-5v-5h-5V8h-8V2H29v5h-6v5h-7v5H8v4H0z"/><path fill={dark ? '#505978' : '#ffe0c8'} d="M6 21h10v-4h9v-5h9V7h7v6h-5v6h7v-4h8v6h9v3H6z"/><path fill={dark ? '#424967' : '#ecd0d3'} d="M14 21h14v-4h5v4h8v-3h7v6H14z"/><path fill={dark ? '#383e60' : '#d6c1d3'} d="M0 24h60v3H0z"/></>;
}
export function WeatherIcon({ kind, isDay = true, size = 32, className = '' }: { kind: WeatherKind; isDay?: boolean; size?: number; className?: string }) {
  return <svg className={`weather-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges" focusable="false">
    {kind === 'clear' ? (isDay ? <Sun /> : <Moon />) : kind === 'partly-cloudy' ? <><g transform="translate(0 -1) scale(.75)">{isDay ? <Sun /> : <Moon />}</g><g transform="translate(5 6) scale(.8)"><Cloud /></g></> : kind === 'unknown' ? <><Cloud /><path fill="#514d69" d="M11 9h3v4h-3zm0 6h3v2h-3z"/></> : <>
      <g transform={['rain', 'snow', 'storm'].includes(kind) ? 'translate(0 -3)' : undefined}><Cloud dark={kind === 'storm'} /></g>
      {kind === 'rain' ? <path fill="#4d9fda" d="M5 17h3v3H6v3H3v-3h2zm7 0h3v3h-2v3h-3v-3h2zm7 0h3v3h-2v3h-3v-3h2z"/> : null}
      {kind === 'snow' ? <path fill="#71acd0" d="M5 17h2v2h2v2H7v2H5v-2H3v-2h2zm12 0h2v2h2v2h-2v2h-2v-2h-2v-2h2z"/> : null}
      {kind === 'storm' ? <path fill="#ffcf51" stroke="#776146" strokeWidth=".6" d="M11 13h7l-4 5h4l-8 6 2-6H8z"/> : null}
      {kind === 'fog' ? <path fill="#929bb0" d="M0 16h18v2H0zm5 4h19v2H5z"/> : null}
    </>}
  </svg>;
}
