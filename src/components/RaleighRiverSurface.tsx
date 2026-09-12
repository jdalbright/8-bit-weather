import { useId } from 'react';
import type { CSSProperties } from 'react';
import type { SceneState } from '../types';

// Each translation is a complete texture period. Its last position is visually
// identical to its first, so even the wrap advances downstream by one pixel step.
const reaches = [
  { top: 664, bottom: 708, fadeIn: 0, fadeOut: 32 / 44, dx: -64, dy: 0 },
  { top: 696, bottom: 742, fadeIn: 12 / 46, fadeOut: 34 / 46, dx: 64, dy: 32 },
  { top: 730, bottom: 820, fadeIn: 12 / 90, fadeOut: 1, dx: 64, dy: 32 },
] as const;
const lights = ['day', 'overcast', 'night'] as const;

export function RaleighRiverSurface({ scene }: { scene: SceneState }) {
  const id = `river-texture-${useId().replace(/:/g, '')}`;
  const rain = scene.kind === 'rain' || scene.kind === 'storm';
  const wet = ['cloudy', 'fog', 'rain', 'snow', 'storm'].includes(scene.kind);
  const energy = rain ? scene.precipitationIntensity : scene.windStrength * .35;
  return <g className="raleigh-river-surface" style={{ '--river-flow-duration': `${12 - energy * 2}s` } as CSSProperties}>
    <defs>
      <mask id={id} maskUnits="userSpaceOnUse" x="392" y="664" width="568" height="137" style={{ maskType: 'luminance' }}>
        <image href="/art/raleigh-water/coverage.png" x="392" y="664" width="568" height="137" />
      </mask>
      {reaches.map((reach, i) => <g key={i}>
        <linearGradient id={`${id}-fade-${i}`} x1="0" y1={reach.top} x2="0" y2={reach.bottom} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="white" stopOpacity={reach.fadeIn ? 0 : 1} />
          <stop offset={reach.fadeIn} stopColor="white" />
          <stop offset={reach.fadeOut} stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity={reach.fadeOut < 1 ? 0 : 1} />
        </linearGradient>
        <mask id={`${id}-reach-${i}`} maskUnits="userSpaceOnUse" x="392" y={reach.top} width="568" height={reach.bottom - reach.top}>
          <rect x="392" y={reach.top} width="568" height={reach.bottom - reach.top} fill={`url(#${id}-fade-${i})`} />
        </mask>
      </g>)}
      {lights.map(light => <pattern key={light} id={`${id}-${light}`} width="64" height="32" patternUnits="userSpaceOnUse">
        <image className="raleigh-water-texture" href={`/art/raleigh-water/water-${light}.png`} width="64" height="32" />
      </pattern>)}
    </defs>
    <g mask={`url(#${id})`} opacity=".76">
      {lights.map(light => <g key={light} className="raleigh-water-light" data-water-light={light}
        style={{ opacity: light === 'night' ? 1 - scene.daylight : light === 'overcast' ? Number(wet) : 1 }}>
        {reaches.map((reach, i) => <g key={i} mask={`url(#${id}-reach-${i})`}>
          <rect className="raleigh-water-flow" data-flow-reach={i} x="300" y="620" width="760" height="240"
            fill={`url(#${id}-${light})`} style={{ '--flow-x': `${reach.dx}px`, '--flow-y': `${reach.dy}px` } as CSSProperties} />
        </g>)}
      </g>)}
    </g>
  </g>;
}
