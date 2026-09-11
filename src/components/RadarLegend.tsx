import type { RadarLayer } from '../lib/radar';
import { Icon } from './Icons';

// Colors sampled from NOAA's bundled PCPNTYP_CT.png, in source legend order.
const precipitationTypes = [
  { code: 'WS', label: 'Warm stratiform rain', color: '#0450a4' },
  { code: 'S', label: 'Snow', color: '#c8c8c8' },
  { code: 'C', label: 'Convective rain', color: '#ff3232' },
  { code: 'H', label: 'Hail', color: '#960096' },
  { code: 'CS', label: 'Cool stratiform rain', color: '#6effff' },
  { code: 'ST', label: 'Tropical stratiform rain', color: '#00f900' },
  { code: 'CT', label: 'Tropical convective rain', color: '#009700' },
] as const;
const reflectivityTicks = [-20, 0, 20, 40, 60, 70];

export function RadarLegend({ layer }: { layer: RadarLayer }) {
  const intensity = layer === 'intensity';
  return <section className="radar-legend" aria-labelledby="radar-legend-title">
    <div className="radar-legend-heading">
      <h2 id="radar-legend-title"><Icon name="radar" size={18}/>{intensity ? 'Radar intensity' : 'Precipitation type'}</h2>
      <span className="radar-legend-badge">{intensity ? 'dBZ' : '7 types'}</span>
    </div>
    {intensity ? <>
      <div className="radar-strength-direction"><span>Weaker echoes</span><span>Stronger echoes</span></div>
      <div className="radar-strength-scale" role="img" aria-label="NOAA echo strength from minus 20 to 70 dBZ. Colors progress from muted gray and blue through green, yellow, red, pink, and purple as echoes strengthen.">
        <div className="radar-strength-bar" aria-hidden="true"><img src="/radar/BREFQCD_CT.png" alt="" width="500" height="36"/></div>
        <div className="radar-strength-ticks" aria-hidden="true">{reflectivityTicks.map(value => <span key={value} style={{ left: `${(value + 20) / 90 * 100}%` }}>{value < 0 ? `−${-value}` : value}</span>)}</div>
      </div>
      <p>Echo strength in dBZ. Stronger echoes can indicate heavier precipitation.</p>
    </> : <>
      <dl className="radar-type-key">{precipitationTypes.map(type => <div key={type.code}>
        <dt><span className="radar-type-swatch" style={{ backgroundColor: type.color }} aria-hidden="true"/><span>{type.code}</span></dt>
        <dd>{type.label}</dd>
      </div>)}</dl>
      <p>Radar-estimated type. Sleet and freezing rain are not identified separately.</p>
    </>}
    <p className="radar-legend-coverage">Coverage varies. Blank areas may have no radar data.</p>
  </section>;
}
