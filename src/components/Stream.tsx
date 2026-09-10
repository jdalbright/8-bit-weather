import { useId } from 'react';
import type { CSSProperties } from 'react';
import type { SceneState } from '../types';
import type { Landscape } from '../lib/landscapes';
import { landscapes } from '../lib/landscapes';
import { WaterRipples } from './WaterRipples';

export function Stream({ scene, landscape, discoveryId }: {
  scene: SceneState; landscape: Landscape; discoveryId?: number;
}) {
  const clipId = `stream-${useId().replace(/:/g, '')}`;
  const layout = landscapes[landscape].water;
  const { currents, eddies } = layout;
  const rain = scene.kind === 'rain' || scene.kind === 'storm';
  // Weather changes the surface's character, not a claimed measurement of flow.
  const energy = rain ? scene.precipitationIntensity : 0;
  const style = {
    '--stream-duration': `${layout.duration - energy * .8}s`,
    '--stream-light': `rgb(${Math.round(130 + scene.daylight * 80)} ${Math.round(163 + scene.daylight * 73)} ${Math.round(231 + scene.daylight * 12)})`,
    '--stream-blue': `rgb(${Math.round(22 + scene.daylight * 30)} ${Math.round(62 + scene.daylight * 79)} ${Math.round(151 + scene.daylight * 48)})`,
    '--stream-opacity': layout.opacity + energy * .12,
  } as CSSProperties;
  return <g className="stream" data-landscape={landscape} data-water-kind="stream" style={style}>
    <defs><clipPath id={clipId}><path className="stream-waterline" d={layout.mask}/></clipPath></defs>
    <g className="stream-water" clipPath={`url(#${clipId})`}>
      <g className="stream-depth">{currents.map((d, i) => <path key={i} className="stream-current stream-undercurrent" d={d}
        style={{ animationDelay: `${-i * .73}s` }} />)}</g>
      <g className="stream-reflections">{currents.map((d, i) => <path key={i} className="stream-current stream-highlight" d={d}
        style={{ animationDelay: `${-i * .91}s`, strokeWidth: 2 + i % 3, '--stream-duration': `${(3.5 + i * .31 - energy * .65) * layout.duration / 4.2}s` } as CSSProperties} />)}</g>
      <g className="stream-eddies">{eddies.map(([x, y, scale], i) => <g key={i} transform={`translate(${x} ${y}) scale(${scale})`}>
        <path className="stream-eddy" d="M-15-2h12v-2h11v2h8v3h-5m-23 3h16v2h9" style={{ animationDelay: `${-i * .51}s` }}/>
      </g>)}</g>
      <WaterRipples scene={scene} layout={layout} discoveryId={discoveryId}/>
    </g>
  </g>;
}
