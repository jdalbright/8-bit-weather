import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { SceneState } from '../types';
import { SceneCloud, WeatherIcon } from './Icons';

// All station coordinates are authored in the landscape's 960-pixel-wide grid.
// Discrete sprite frames keep the cups upright as they circle the fixed mast.
const rotorFrames = Array.from({ length: 12 }, (_, frame) => Array.from({ length: 3 }, (_, cup) => {
  const angle = (frame / 12 + cup / 3) * Math.PI * 2;
  return { x: Math.round(36 + Math.cos(angle) * 24), y: Math.round(34 + Math.sin(angle) * 9) };
}).sort((a, b) => a.y - b.y));

function StationRotor() {
  return <g className="station-animation">
    <path className="station-post-outline" d="M188 509h14v23h-14z" />
    <path className="station-metal" d="M192 511h7v21h-7z" />
    <path className="station-highlight" d="M192 511h3v21h-3z" />
    <svg className="station-rotor" x="159" y="477" width="72" height="60" viewBox="0 0 72 60" overflow="hidden">
      <g className="station-rotor-strip">{rotorFrames.map((cups, frame) => <g key={frame} transform={`translate(${frame * 72} 0)`}>
        {cups.map(({ x, y }, cup) => <g key={cup}>
          <path className="station-arm-outline" d={`M36 34L${x} ${y}`} />
          <path className="station-arm" d={`M36 34L${x} ${y}`} />
          <path className="station-post-outline" d={`M${x - 3} ${y - 14}h6v2h3v11h-3v2h-6v-2h-3v-11h3z`} />
          <path className="station-metal" d={`M${x - 3} ${y - 11}h6v9h-6z`} />
          <path className="station-highlight" d={`M${x - 3} ${y - 11}h3v7h-3z`} />
        </g>)}
      </g>)}</g>
    </svg>
    <rect className="station-hub station-post-outline" x="189" y="507" width="12" height="8" />
    <path className="station-metal" d="M192 509h6v3h-6z" />
  </g>;
}

export function Scenery({ scene, animate, children, className = '' }: { scene: SceneState; animate: boolean; children?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!ref.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  const wet = ['cloudy', 'fog', 'rain', 'snow', 'storm'].includes(scene.kind);
  const art = !scene.isDay ? 'night' : wet ? 'overcast' : 'day';
  const artHeight = art === 'day' ? 800 : 801;
  const precip = ['rain', 'storm', 'snow'].includes(scene.kind);
  return <div ref={ref} className={`scenery ${className} scene-${scene.kind} ${scene.isDay ? 'daytime' : 'nighttime'}`} data-animate={animate && inView} data-scene={`${scene.kind}-${scene.isDay ? 'day' : 'night'}`}>
    <div className="landscape" aria-hidden="true">
      <img className="landscape-art" src={`/art/scene-${art}-v2.webp`} alt="" width="960" height={artHeight} fetchPriority="high" draggable="false" />
      {/* Match object-fit: cover / center bottom so details follow the image crop. */}
      <svg className="landscape-details" viewBox={`0 0 960 ${artHeight}`} preserveAspectRatio="xMidYMax slice" shapeRendering="crispEdges">
        <g className="water-glints"><path d="M691 744h30v4h-30z"/><path d="M806 768h44v4h-44z"/><path d="M595 704h25v4h-25z"/><path d="M538 688h14v4h-14z"/></g>
        <StationRotor />
      </svg>
      {!scene.isDay ? <div className="stars">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${8 + (i * 23) % 87}%`, top: `${3 + (i * 13) % 45}%`, animationDelay: `${i * -0.8}s` }} />)}</div> : null}
      {!wet || !scene.isDay ? <WeatherIcon className="celestial" kind="clear" isDay={scene.isDay} size={56} /> : null}
      {[0, 1, 2, ...(wet ? [3, 4] : [])].map(i => <svg key={i} className={`scene-cloud cloud-${i}`} viewBox="0 0 60 28" shapeRendering="crispEdges"><SceneCloud dark={scene.kind === 'storm' || !scene.isDay} /></svg>)}
      {scene.kind === 'fog' ? <div className="fog-banks"><i/><i/></div> : null}
      {precip ? <div className={`precipitation ${scene.kind === 'snow' ? 'snowfall' : 'rainfall'}`}>
        {Array.from({ length: scene.kind === 'snow' ? 20 : 28 }, (_, i) => <i key={i} style={{ '--x': `${(i * 37 + 3) % 100}%`, '--delay': `${-((i * 1.7) % 12)}s`, '--duration': `${scene.kind === 'snow' ? 5 + (i % 5) : 0.9 + (i % 5) * 0.15}s` } as CSSProperties}/>)}</div> : null}
      {scene.kind === 'storm' ? <div className="distant-lightning" /> : null}
    </div>
    <div className="scene-content">{children}</div>
  </div>;
}
