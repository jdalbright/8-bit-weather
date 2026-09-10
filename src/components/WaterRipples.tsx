import type { SceneState } from '../types';
import type { WaterLayout } from '../lib/water-layouts';

export function WaterRipples({ scene, layout, discoveryId }: { scene: SceneState; layout: WaterLayout; discoveryId?: number }) {
  return <>
    {scene.kind === 'rain' || scene.kind === 'storm' ? <g className="rain-ripples">{layout.rainRipples.map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}>
      <path className="river-ring ambient-ripple" d="M-18 0h-8v4h8m36-4h8v4h-8M-18-3h36M-18 7h36" style={{ animationDelay: `${i * -.8}s` }}/>
    </g>)}</g> : null}
    {discoveryId !== undefined ? <g transform={`translate(${layout.anchor.x} ${layout.anchor.y})`}>
      <g key={discoveryId} className="river-discovery"><path className="river-ring" d="M-23-4h46M-23 7h46M-23-1h-8v4h8m46-4h8v4h-8"/><path className="river-ring inner-ring" d="M-11-1h22M-11 4h22"/></g>
    </g> : null}
  </>;
}
