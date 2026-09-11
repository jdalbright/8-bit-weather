import { triggerHaptic } from '../lib/native-experience';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Discovery, SceneState } from '../types';
import { anchors, ART, sceneGeometry } from '../lib/scene';
import { SceneCloud, WeatherIcon } from './Icons';
import { landscapes, landscapeSource } from '../lib/landscapes';
import type { Landscape } from '../lib/landscapes';
import { Stream } from './Stream';
import { OceanSurface } from './OceanSurface';
import { RaleighWildlife } from './RaleighWildlife';

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

export function Scenery({ scene, animate, onDiscover, children, className = '', landscape = 'meadow' }: {
  scene: SceneState; animate: boolean; onDiscover: (discovery: Discovery) => void; children?: ReactNode; className?: string; landscape?: Landscape;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [discovery, setDiscovery] = useState<{ kind: Discovery; id: number } | null>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const lastTap = useRef(-Infinity);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => { const { width, height } = node.getBoundingClientRect(); setSize({ width, height }); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!ref.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  useEffect(() => () => window.clearTimeout(feedbackTimer.current), []);
  useEffect(() => {
    const clear = () => { if (document.hidden) { window.clearTimeout(feedbackTimer.current); setDiscovery(null); } };
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, []);
  function discover(kind: Discovery) {
    if (!inView || document.hidden || performance.now() - lastTap.current < 180) return;
    lastTap.current = performance.now();
    window.clearTimeout(feedbackTimer.current);
    setDiscovery(previous => ({ kind, id: (previous?.id ?? 0) + 1 }));
    triggerHaptic(kind === 'river' ? { kind: 'pattern', name: 'waterRipple' } : { kind: 'impact', style: 'rigid' });
    onDiscover(kind);
    feedbackTimer.current = window.setTimeout(() => setDiscovery(null), animate ? 1600 : 650);
  }
  const wet = ['cloudy', 'fog', 'rain', 'snow', 'storm'].includes(scene.kind);
  const precip = ['rain', 'storm', 'snow'].includes(scene.kind);
  const wildlife = !['storm', 'snow', 'unknown'].includes(scene.kind);
  const definition = landscapes[landscape];
  const { vegetation, birds, fireflies } = definition;
  const waterDiscovery = discovery?.kind === 'river' ? discovery.id : undefined;
  const twilight = scene.phase === 'dawn' || scene.phase === 'dusk' ? Math.sin(Math.PI * scene.transition) : 0;
  const geometry = sceneGeometry(size.width, size.height);
  const style = {
    '--cover-scale': geometry.scale, '--cover-left': `${geometry.left}px`, '--cover-top': `${geometry.top}px`,
    '--cloud-duration': `${80 - scene.windStrength * 50}s`, '--grass-duration': `${5 - scene.windStrength * 3}s`,
    '--grass-lean': `${1 + scene.windStrength * 5}deg`, '--rotor-duration': `${12 - scene.windStrength * 10}s`,
    '--rain-slant': `${-10 - scene.windStrength * 22}deg`, '--night': 1 - scene.daylight,
    '--twilight': twilight, '--precip-opacity': .35 + scene.precipitationIntensity * .4,
  } as CSSProperties;
  return <div ref={ref} className={`scenery ${className} scene-${scene.kind} ${scene.isDay ? 'daytime' : 'nighttime'}`} style={style}
    data-animate={animate && inView} data-in-view={inView} data-landscape={landscape} data-scene={`${scene.kind}-${scene.isDay ? 'day' : 'night'}`} data-phase={scene.phase} data-calm={scene.wind < .5}>
    <div className="landscape" aria-hidden="true">
      <div className="landscape-stage">
      {(['day', 'overcast', 'night'] as const).map(art => <img key={art} className={`art-layer ${art === 'day' ? 'landscape-art' : ''}`} data-art={art}
        src={landscapeSource(landscape, art)} alt="" width={ART.width} height={ART.height} fetchPriority={art === 'day' ? 'high' : 'auto'} draggable="false"
        style={{ opacity: art === 'night' ? 1 - scene.daylight : art === 'overcast' ? wet ? 1 : 0 : 1 }} />)}
      <div className="twilight-light" />
      <svg className="landscape-details" viewBox={`0 0 ${ART.width} ${ART.height}`} shapeRendering="crispEdges">
        {definition.water.kind === 'surf' ? <OceanSurface scene={scene} discoveryId={waterDiscovery}/>
          : <Stream scene={scene} landscape={landscape} discoveryId={waterDiscovery}/>}
        {vegetation.positions.map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><g className={`meadow-grass vegetation-${vegetation.kind}`} style={{ animationDelay: `${i * -.7}s` }}>
          <path fill={vegetation.colors[0]} d="M0 0v-10h-4v-10h-4v-8h4v4h4v9h4v15zm8 0v-18h4v-14h4v-7h4v11h-4v16h-4v12z"/>
          <path fill={vegetation.colors[1]} d="M4 0v-27H0v-8h4v7h4v28zm12 0v-9h4v-9h8v4h-4v8h-4v6z"/>
          {vegetation.kind !== 'grass' ? <>
            <path fill={vegetation.colors[0]} d="M7 0v-47h3v47zm14 0v-35h3v-12h3v16h-3v31z"/>
            <path fill={vegetation.colors[1]} d={vegetation.kind === 'sea-oats' ? 'M4-48h6v3H4zm6-6h6v3h-6zm-6 12h6v3H4zm20-9h6v3h-6zm6-6h6v3h-6z' : 'M5-59h7v15H5zm18 4h7v14h-7z'}/>
          </> : null}
        </g></g>)}
        <StationRotor />
        <rect className={`station-indicator ${discovery?.kind === 'station' ? 'indicator-active' : ''}`} x={anchors.station.x - 4} y={anchors.station.y - 4} width="8" height="8" />
        {landscape !== 'raleigh' && wildlife && scene.isDay && ['clear', 'partly-cloudy', 'cloudy'].includes(scene.kind) ? <g className="meadow-birds" data-bird={birds.kind}>{birds.positions.map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><g className="meadow-bird" style={{ animationDelay: `${-i * 19}s` }}>
          <path fill={birds.kind === 'gull' ? '#eee5cf' : '#29294a'} d="M-15-4h6v3h6v4h6v-4h6v-3h6v4h-6v4H6v3H-6V4h-6V0h-3z"/><path fill={birds.kind === 'gull' ? '#596676' : '#d9c8ab'} d="M-3 1h6v3h-6z"/>
        </g></g>)}</g> : null}
        {wildlife && !scene.isDay && fireflies.length > 0 ? <g className="meadow-fireflies">{fireflies.map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><g className="meadow-firefly" style={{ animationDelay: `${i * -1.3}s` }}><rect x="-4" y="-4" width="8" height="8" fill="#ffe898" opacity=".18"/><rect x="-1" y="-1" width="3" height="3" fill="#fbea9c"/></g></g>)}</g> : null}
      </svg>
      {landscape === 'raleigh' ? <RaleighWildlife scene={scene} /> : null}
      {!scene.isDay ? <div className="stars">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${8 + (i * 23) % 87}%`, top: `${3 + (i * 13) % 45}%`, animationDelay: `${i * -0.8}s` }} />)}</div> : null}
      {!wet || !scene.isDay ? <WeatherIcon className="celestial" kind="clear" isDay={scene.isDay} size={112} /> : null}
      {[0, 1, 2, ...(wet ? [3, 4] : [])].map(i => <svg key={i} className={`scene-cloud cloud-${i}`} viewBox="0 0 60 28" shapeRendering="crispEdges"><SceneCloud dark={scene.kind === 'storm' || !scene.isDay} /></svg>)}
      {scene.kind === 'fog' ? <div className="fog-banks"><i/><i/></div> : null}
      {precip ? <div className={`precipitation ${scene.kind === 'snow' ? 'snowfall' : 'rainfall'}`}>
        {Array.from({ length: Math.round((scene.kind === 'snow' ? 10 : 12) + scene.precipitationIntensity * (scene.kind === 'snow' ? 10 : 16)) }, (_, i) => <i key={i} style={{ '--x': `${(i * 37 + 3) % 100}%`, '--delay': `${-((i * 1.7) % 12)}s`, '--duration': `${scene.kind === 'snow' ? 7 + (i % 5) : 1.3 + (i % 5) * 0.2}s` } as CSSProperties}/>)}</div> : null}
      {scene.kind === 'storm' ? <div className="distant-lightning" /> : null}
      </div>
    </div>
    <div className="scene-content">{children}</div>
    <div className="scene-hotspots">
      {(['station', 'river'] as const).map(kind => {
        const anchor = kind === 'river' ? definition.water.anchor : anchors.station;
        const x = Math.max(22, Math.min(size.width - 22, geometry.left + anchor.x * geometry.scale));
        const y = Math.max(22, Math.min(size.height - 22, geometry.top + anchor.y * geometry.scale));
        return <button key={kind} className="scene-hotspot" data-discovery={kind} data-active={discovery?.kind === kind}
          style={{ left: x, top: y }} aria-label={kind === 'river' ? definition.water.label : 'Blink the weather station light'} onClick={() => discover(kind)} />;
      })}
    </div>
  </div>;
}
