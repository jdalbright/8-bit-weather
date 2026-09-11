import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { isNativeApp } from '../lib/native';
import { triggerHaptic } from '../lib/native-experience';

/** Tick once per tile boundary during a user's scroll, including its momentum. */
export function useHourlyScrollHaptics(rail: RefObject<HTMLDivElement | null>, identity: string) {
  const start = useRef(() => {});
  useEffect(() => {
    const element = rail.current;
    if (!element || !isNativeApp()) return;
    let active = false;
    let index = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const position = () => {
      const width = element.firstElementChild?.getBoundingClientRect().width ?? 0;
      return width > 0 ? Math.round(Math.max(0, element.scrollLeft) / width) : 0;
    };
    const idle = () => { clearTimeout(timer); timer = setTimeout(() => { active = false; }, 200); };
    const begin = () => { if (!active) index = position(); active = true; idle(); };
    const move = (event: PointerEvent) => { if (event.buttons || event.pointerType === 'touch') begin(); };
    const key = (event: KeyboardEvent) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) begin(); };
    const scroll = () => {
      if (!active) return;
      idle();
      const next = position();
      if (next !== index) { index = next; triggerHaptic('selection', true); }
    };
    start.current = begin;
    element.addEventListener('pointerdown', begin, { passive: true });
    element.addEventListener('pointermove', move, { passive: true });
    element.addEventListener('wheel', begin, { passive: true });
    element.addEventListener('keydown', key);
    element.addEventListener('scroll', scroll, { passive: true });
    return () => {
      clearTimeout(timer); start.current = () => {};
      element.removeEventListener('pointerdown', begin);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('wheel', begin);
      element.removeEventListener('keydown', key);
      element.removeEventListener('scroll', scroll);
    };
  }, [rail, identity]);
  return useCallback(() => start.current(), []);
}
