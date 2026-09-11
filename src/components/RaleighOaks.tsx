import type { CSSProperties } from 'react';
import type { SceneState } from '../types';

const lights = ['day', 'overcast', 'night'] as const;

export function RaleighOaks({ scene }: { scene: SceneState }) {
  const overcast = ['cloudy', 'fog', 'rain', 'snow', 'storm'].includes(scene.kind);
  return <div className="raleigh-oaks" aria-hidden="true" style={{ '--oak-duration': `${8 - scene.windStrength * 2}s` } as CSSProperties}>
    {(['left', 'right'] as const).map(side => <div className={`raleigh-oak oak-${side}`} key={side}>
      {lights.map(light => <div className="oak-light" data-oak-light={light} key={light}
        style={{ opacity: light === 'night' ? 1 - scene.daylight : light === 'overcast' ? Number(overcast) : 1 }}>
        <div className="oak-frames" style={{ backgroundImage: `url('/art/raleigh-oaks/oak-${side}-${light}.webp')` }} />
      </div>)}
    </div>)}
  </div>;
}
