import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ active: true }));
vi.mock('../lib/native', () => ({ isAppActive: () => native.active, NATIVE_ACTIVITY_EVENT: '8bit-native-activity' }));
import { useMotion } from './useMotion';
it('suspends animation on native background events even while the document remains visible', () => {
  const { result } = renderHook(() => useMotion(false)); expect(result.current.animate).toBe(true);
  act(() => { native.active = false; window.dispatchEvent(new Event('8bit-native-activity')); }); expect(result.current.animate).toBe(false);
  act(() => { native.active = true; window.dispatchEvent(new Event('8bit-native-activity')); }); expect(result.current.animate).toBe(true);
});
it('keeps the user reduced-motion choice when resuming', () => {
  const { result } = renderHook(() => useMotion(true));
  act(() => { native.active = false; window.dispatchEvent(new Event('8bit-native-activity')); native.active = true; window.dispatchEvent(new Event('8bit-native-activity')); }); expect(result.current.animate).toBe(false);
});
