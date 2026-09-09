import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icons';

type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing';
type Gesture = { id: number; x: number; y: number; active: boolean; distance: number };
const THRESHOLD = 64;
const MAX_PULL = 88;
const IGNORE = 'button, a, input, select, textarea, summary, [role="button"], [role="slider"], [contenteditable]:not([contenteditable="false"]), [data-pull-refresh-ignore]';

interface Props {
  enabled: boolean;
  disabled: boolean;
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

export function PullToRefresh({ enabled, disabled, onRefresh, children }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const [feedback, setFeedback] = useState<{ phase: Phase; distance: number }>({ phase: 'idle', distance: 0 });
  const canRefresh = useEffectEvent(() => !disabled && !pending.current && navigator.onLine && !document.hidden);
  const refreshWeather = useEffectEvent(onRefresh);

  useEffect(() => {
    const element = surface.current;
    if (!enabled || !element) return;
    let mounted = true;
    let gesture: Gesture | null = null;
    const atTop = () => window.scrollY <= 1 && (document.scrollingElement?.scrollTop ?? 0) <= 1;
    const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;
    function cancel() {
      gesture = null;
      if (!pending.current) setFeedback(current => current.phase === 'idle' ? current : { phase: 'idle', distance: 0 });
    }
    function start(event: TouchEvent) {
      cancel();
      if (event.touches.length !== 1 || !canRefresh() || !atTop() || zoomed()) return;
      if (event.target instanceof Element && event.target.closest(IGNORE)) return;
      // Leave nested scrollers in charge of their own touch gestures.
      for (let target = event.target instanceof Element ? event.target : null; target && target !== element; target = target.parentElement) {
        if (target.scrollHeight > target.clientHeight || target.scrollWidth > target.clientWidth) {
          const style = window.getComputedStyle(target);
          if (/(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) return;
        }
      }
      const touch = event.touches[0];
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, active: false, distance: 0 };
    }
    function move(event: TouchEvent) {
      if (!gesture) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch.identifier !== gesture.id || !canRefresh() || !atTop() || zoomed() || !event.cancelable) {
        cancel(); return;
      }
      const dx = Math.abs(touch.clientX - gesture.x), dy = touch.clientY - gesture.y;
      if (!gesture.active) {
        if (Math.max(dx, Math.abs(dy)) < 8) return;
        // Lock direction once: an ordinary scroll must never turn into a refresh.
        if (dy <= 0 || dy < dx * 1.2) { cancel(); return; }
        gesture.active = true;
      }
      if (dy <= 0 || dx > dy * 1.2) { cancel(); return; }
      // Native React touch listeners are passive. Cancel only a claimed pull here.
      event.preventDefault();
      gesture.distance = Math.min(MAX_PULL, dy * 0.5);
      setFeedback({ phase: gesture.distance >= THRESHOLD ? 'ready' : 'pulling', distance: gesture.distance });
    }
    function end(event: TouchEvent) {
      if (!gesture) return;
      const shouldRefresh = event.touches.length === 0 && gesture.active && gesture.distance >= THRESHOLD && canRefresh() && atTop() && !zoomed();
      gesture = null;
      if (!shouldRefresh) { cancel(); return; }
      pending.current = true;
      setFeedback({ phase: 'refreshing', distance: THRESHOLD });
      void (async () => {
        try { await refreshWeather(); }
        finally {
          pending.current = false;
          if (mounted) setFeedback({ phase: 'idle', distance: 0 });
        }
      })();
    }
    function scroll() { if (gesture && !atTop()) cancel(); }
    function visibility() { if (document.hidden) cancel(); }

    document.documentElement.classList.add('weather-pull-refresh');
    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end, { passive: true });
    element.addEventListener('touchcancel', cancel, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted = false;
      document.documentElement.classList.remove('weather-pull-refresh');
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', cancel);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [enabled]);

  const { phase, distance } = feedback;
  const label = phase === 'refreshing' ? 'Refreshing…' : phase === 'ready' ? 'Release to refresh' : phase === 'pulling' ? 'Pull to refresh' : '';
  return <div ref={surface} className="pull-refresh-surface">
    <div className="pull-refresh-feedback" data-phase={phase} style={{ height: distance }} aria-hidden={phase === 'idle'}>
      <div className="pull-refresh-message" role="status" aria-live="polite" aria-atomic="true">
        <Icon name={phase === 'refreshing' ? 'refresh' : 'chevron'} size={20} className="pull-refresh-icon"/>
        <span>{label}</span>
        <span className="pull-refresh-meter" aria-hidden="true">{[1, 2, 3, 4].map(step => <i key={step} data-filled={distance >= THRESHOLD * step / 4}/>)}</span>
      </div>
    </div>
    {children}
  </div>;
}
