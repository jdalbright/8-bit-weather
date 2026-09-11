import type { CSSProperties } from 'react';
import type { SceneState } from '../types';

// Coordinates belong to the same 960 × 801 stage as the Raleigh painting.
const leaves = [
  { x: 112, y: 430, dx: 110, dy: 265 },
  { x: 168, y: 510, dx: 80, dy: 230 },
  { x: 82, y: 570, dx: 150, dy: 210 },
  { x: 824, y: 414, dx: -100, dy: 270 },
  { x: 866, y: 493, dx: -80, dy: 245 },
  { x: 792, y: 554, dx: -60, dy: 215 },
];

export function RaleighWildlife({ scene }: { scene: SceneState }) {
  const birds = scene.isDay && ['clear', 'partly-cloudy', 'cloudy'].includes(scene.kind);
  const fallingLeaves = !['snow', 'unknown'].includes(scene.kind);
  const style = {
    '--wildlife-brightness': .45 + .55 * scene.daylight,
    '--wildlife-saturation': ['clear', 'partly-cloudy'].includes(scene.kind) ? 1 : .7,
  } as CSSProperties;

  return <div className="raleigh-wildlife" aria-hidden="true" style={style}>
    {birds ? <>
      <div className="raleigh-bird-flight raleigh-cardinal" data-species="cardinal">
        <div className="raleigh-bird-facing"><div className="raleigh-bird-sprite" /></div>
      </div>
      <div className="raleigh-bird-flight raleigh-blue-jay" data-species="blue-jay">
        <div className="raleigh-bird-facing"><div className="raleigh-bird-sprite" /></div>
      </div>
      <div className="raleigh-resting-bird raleigh-cardinal"><div className="raleigh-bird-sprite" /></div>
    </> : null}
    {fallingLeaves ? <div className="raleigh-leaves">{leaves.map((leaf, index) => {
      const duration = 18 - scene.windStrength * 9 + index % 3;
      return <div key={index} className="raleigh-leaf-path" style={{
        left: leaf.x, top: leaf.y,
        '--leaf-dx': `${leaf.dx}px`, '--leaf-dy': `${leaf.dy}px`,
        '--leaf-duration': `${duration}s`, '--leaf-delay': `${-index * duration / leaves.length}s`,
      } as CSSProperties}><div className="raleigh-leaf-sprite" style={{ animationDelay: `${-index * .13}s` }} /></div>;
    })}</div> : null}
  </div>;
}
