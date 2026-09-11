import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Map as LibreMap, Marker, setWorkerCount, setWorkerUrl, type ImageSource, type StyleSpecification } from 'maplibre-gl';
import workerUrl from '../lib/radar-worker.ts?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import './radar-map.css';
import mapStyle from '../data/radar-map-style.json';
import { decodeRadarImage, RadarImageCache } from '../lib/radar-images';
import { intersectsRadar, radarImageUrl, type RadarBounds, type RadarFrame, type RadarManifest } from '../lib/radar';
import type { Place } from '../types';
import { Icon } from './Icons';

export interface RadarMapStatus { loading: boolean; time: number | null; error: string | null; outside: boolean }
interface Props {
  place: Place; manifest: RadarManifest; frame: RadarFrame; nextFrame?: RadarFrame;
  onStatus: (status: RadarMapStatus) => void; onMove: () => void;
}
interface Viewport { bounds: RadarBounds; width: number; height: number }

setWorkerUrl(workerUrl);
setWorkerCount(1);
export default function RadarMap({ place, manifest, frame, nextFrame, onStatus, onMove }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const cache = useRef(new RadarImageCache());
  const shown = useRef<number | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [retry, setRetry] = useState(0);
  const report = useEffectEvent(onStatus);
  const moved = useEffectEvent(onMove);
  const initial = useRef(place);
  const request = useRef<AbortController | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    let instance: LibreMap;
    try {
      instance = new LibreMap({ container: container.current, style: structuredClone(mapStyle) as StyleSpecification,
        center: [initial.current.longitude, initial.current.latitude], zoom: 7,
        renderWorldCopies: false,
        dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: false,
      });
    } catch {
      setMapError('This device couldn’t start the map. Try reopening Radar.');
      report({ loading: false, time: null, error: 'The map is unavailable on this device.', outside: false });
      return;
    }
    map.current = instance;
    instance.touchZoomRotate.disableRotation();
    instance.keyboard.disableRotation();
    instance.getCanvas().setAttribute('aria-label', 'Precipitation map. Use arrow keys to pan and plus or minus to zoom.');
    const marker = document.createElement('div'); marker.className = 'radar-place-marker';
    marker.setAttribute('role', 'img'); marker.setAttribute('aria-label', initial.current.name);
    new Marker({ element: marker }).setLngLat([initial.current.longitude, initial.current.latitude]).addTo(instance);
    let ready = false;
    let interrupted = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (!ready || interrupted) return;
      const bounds = instance.getBounds();
      const element = instance.getContainer();
      const scale = Math.min(2, window.devicePixelRatio || 1, 1024 / Math.max(element.clientWidth, element.clientHeight));
      setViewport({ bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], width: element.clientWidth * scale, height: element.clientHeight * scale });
    };
    const start = () => { if (interrupted) return; request.current?.abort(); moved(); report({ loading: true, time: shown.current, error: null, outside: false }); };
    const end = () => { clearTimeout(settle); settle = setTimeout(update, 150); };
    // Radar can render even if a basemap tile fails; don't wait for every tile.
    instance.on('style.load', () => {
      if (interrupted) return;
      ready = true;
      // Exact -180/180 endpoints wrap to the same point in MapLibre's constraints.
      instance.setMinZoom(3); instance.setMaxZoom(12); instance.setMaxBounds([[-179.999, -80], [179.999, 80]]);
      const blank = document.createElement('canvas'); blank.width = blank.height = 1;
      instance.addSource('radar-image', { type: 'image', coordinates: [[-1, 1], [1, 1], [1, -1], [-1, -1]] });
      (instance.getSource('radar-image') as ImageSource).updateImage({ image: blank });
      const firstLabel = instance.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
      instance.addLayer({ id: 'radar-image', type: 'raster', source: 'radar-image', paint: { 'raster-opacity': 0.8, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } }, firstLabel);
      update();
    });
    instance.on('movestart', start); instance.on('moveend', end);
    instance.on('error', () => { setMapError('Some map details couldn’t load. Reopen Radar to retry.'); });
    instance.on('webglcontextlost', () => {
      interrupted = true; request.current?.abort(); moved(); setMapFailed(true);
      const error = 'The map was interrupted. Retry imagery to restart it.';
      setMapError(error);
      report({ loading: false, time: null, error, outside: false });
    });
    const observer = new ResizeObserver(() => { instance.resize(); end(); });
    observer.observe(container.current);
    const images = cache.current;
    return () => { clearTimeout(settle); observer.disconnect(); request.current?.abort(); images.clear(); instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!viewport || !instance || mapFailed) return;
    request.current?.abort();
    if (!intersectsRadar(viewport.bounds, manifest.bounds)) {
      instance.setLayoutProperty('radar-image', 'visibility', 'none');
      report({ loading: false, time: null, error: null, outside: true });
      return;
    }
    const controller = new AbortController(); request.current = controller;
    report({ loading: true, time: shown.current, error: null, outside: false });
    const url = (value: RadarFrame) => radarImageUrl(manifest, value, viewport.bounds, viewport.width, viewport.height);
    void (async () => {
      try {
        const blob = await cache.current.get(url(frame), controller.signal);
        const image = await decodeRadarImage(blob, controller.signal);
        if (controller.signal.aborted) return;
        const [w, s, e, n] = viewport.bounds;
        (instance.getSource('radar-image') as ImageSource).updateImage({ image, coordinates: [[w, n], [e, n], [e, s], [w, s]] });
        instance.setLayoutProperty('radar-image', 'visibility', 'visible');
        shown.current = frame.time;
        report({ loading: false, time: frame.time, error: null, outside: false });
        if (nextFrame) void cache.current.get(url(nextFrame), controller.signal).catch(() => {});
      } catch (error) {
        if (controller.signal.aborted) return;
        report({ loading: false, time: shown.current, error: error instanceof Error ? error.message : 'Radar imagery couldn’t load.', outside: false });
      }
    })();
    return () => controller.abort();
  }, [viewport, manifest, frame, nextFrame, retry, mapFailed]);

  return <div className="radar-map-stage" data-pull-refresh-ignore>
    <div ref={container} className="radar-map"/>
    <div className="radar-map-controls" aria-label="Map controls">
      <button className="pixel-button small" aria-label="Zoom in" disabled={mapFailed} onClick={() => map.current?.zoomIn({ duration: 0 })}><Icon name="plus" size={17}/></button>
      <button className="pixel-button small" aria-label="Zoom out" disabled={mapFailed} onClick={() => map.current?.zoomOut({ duration: 0 })}><span aria-hidden="true">−</span></button>
      <button className="pixel-button small" aria-label={`Recenter on ${place.name}`} disabled={mapFailed} onClick={() => { map.current?.jumpTo({ center: [place.longitude, place.latitude], zoom: 7, bearing: 0, pitch: 0 }); setRetry(value => value + 1); }}><Icon name="location" size={17}/></button>
    </div>
    {mapError ? <p className="radar-map-warning" role="status">{mapError}</p> : null}
  </div>;
}
