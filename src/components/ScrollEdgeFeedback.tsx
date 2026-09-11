import { useEffect, useRef } from 'react';

const IGNORE = 'button, a, input, select, textarea, [role="slider"], [contenteditable="true"], [data-pull-refresh-ignore]';

/** Decorative feedback only: scrolling, zooming and pull-to-refresh keep ownership. */
export function ScrollEdgeFeedback({ animate }: { animate: boolean }) {
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = overlay.current;
    const surface = element?.parentElement;
    if (!animate || !element || !surface) return;
    let touch: { id: number; x: number; y: number } | null = null;
    let lastInput = -Infinity;
    let direction = 0;
    let lastPulse = -Infinity;
    let previousY = window.scrollY;
    let animation: Animation | undefined;
    const edge = (direction: number) => {
      const root = document.scrollingElement;
      if (!root) return null;
      if (direction < 0 && window.scrollY <= 1) return 'top';
      if (direction > 0 && root.scrollHeight > window.innerHeight + 1 && window.scrollY + window.innerHeight >= root.scrollHeight - 2) return 'bottom';
      return null;
    };
    const pulse = (direction: number) => {
      const side = edge(direction);
      if (!side || Date.now() - lastPulse < 450 || document.hidden || (window.visualViewport?.scale ?? 1) > 1.01) return;
      const band = element.querySelector<HTMLElement>(`[data-edge="${side}"]`);
      if (!band) return;
      lastPulse = Date.now();
      animation?.cancel();
      animation = band.animate([
        { opacity: 0, transform: 'scale(.7, .15)' },
        { opacity: .65, transform: 'scale(1, 1)', offset: .25 },
        { opacity: 0, transform: 'scale(1.06, .25)' },
      ], { duration: 450, easing: 'ease-out' });
    };
    const ignored = (target: EventTarget | null) => {
      if (!(target instanceof Element) || target.closest(IGNORE)) return true;
      for (let node: Element | null = target; node && node !== surface; node = node.parentElement) {
        const style = getComputedStyle(node);
        if ((node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) && /auto|scroll/.test(`${style.overflowX} ${style.overflowY}`)) return true;
      }
      return false;
    };
    const start = (event: TouchEvent) => {
      touch = null;
      direction = 0;
      if (event.touches.length !== 1 || ignored(event.target)) return;
      const point = event.touches[0];
      touch = { id: point.identifier, x: point.clientX, y: point.clientY };
      lastInput = Date.now();
    };
    const move = (event: TouchEvent) => {
      const point = event.touches[0];
      if (!touch || event.touches.length !== 1 || point.identifier !== touch.id) { touch = null; return; }
      const dx = point.clientX - touch.x, dy = point.clientY - touch.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      touch = { id: point.identifier, x: point.clientX, y: point.clientY };
      if (Math.abs(dy) <= Math.abs(dx) * 1.2) return;
      lastInput = Date.now();
      direction = Math.sign(-dy);
      if (!event.defaultPrevented) pulse(-dy);
    };
    const end = () => { if (touch) lastInput = Date.now(); touch = null; };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || ignored(event.target) || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      lastInput = Date.now();
      direction = Math.sign(event.deltaY);
      pulse(event.deltaY);
    };
    const scroll = () => {
      const y = window.scrollY;
      // Ignore navigation, focus and expanding content; allow scroll momentum.
      if (Date.now() - lastInput < 1800 && Math.sign(y - previousY) === direction) pulse(y - previousY);
      previousY = y;
    };
    surface.addEventListener('touchstart', start, { passive: true });
    surface.addEventListener('touchmove', move, { passive: true });
    surface.addEventListener('touchend', end, { passive: true });
    surface.addEventListener('touchcancel', end, { passive: true });
    surface.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      animation?.cancel();
      surface.removeEventListener('touchstart', start);
      surface.removeEventListener('touchmove', move);
      surface.removeEventListener('touchend', end);
      surface.removeEventListener('touchcancel', end);
      surface.removeEventListener('wheel', wheel);
      window.removeEventListener('scroll', scroll);
    };
  }, [animate]);
  return <div ref={overlay} className="scroll-edge-feedback" aria-hidden="true">
    <div data-edge="top"/><div data-edge="bottom"/>
  </div>;
}
