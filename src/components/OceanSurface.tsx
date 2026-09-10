import { useId } from 'react';
import type { CSSProperties } from 'react';
import type { SceneState } from '../types';
import { ocean } from '../lib/water-layouts';
import { WaterRipples } from './WaterRipples';

export function OceanSurface({ scene, discoveryId }: { scene: SceneState; discoveryId?: number }) {
  const clipId = `surf-${useId().replace(/:/g, '')}`;
  // Wind lends the illustration energy; this does not model tides or wave height.
  const style = {
    '--surf-duration': `${ocean.duration - scene.windStrength * 1.5}s`,
    '--stream-light': `rgb(${Math.round(119 + scene.daylight * 116)} ${Math.round(151 + scene.daylight * 99)} ${Math.round(215 + scene.daylight * 40)})`,
  } as CSSProperties;
  return <g className="ocean-surface" data-water-kind="surf" style={style}>
    <defs><clipPath id={clipId}><path className="surf-waterline" d={ocean.mask}/></clipPath></defs>
    <g className="surf-water" clipPath={`url(#${clipId})`}>
      {ocean.currents.map((d, i) => <g key={i}>
        <path className="surf-shimmer" d={d} style={{ animationDelay: `${-i * .83}s` }}/>
        <path className="surf-wave" d={d} style={{ animationDelay: `${-i * 1.15}s`, strokeWidth: 2 + i * .55 }}/>
      </g>)}
      <WaterRipples scene={scene} layout={ocean} discoveryId={discoveryId}/>
    </g>
  </g>;
}
