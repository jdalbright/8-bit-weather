import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ native: true, active: true, get: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock('../lib/native', () => ({ isNativeApp: () => mock.native, isAppActive: () => mock.active, NATIVE_ACTIVITY_EVENT: 'activity' }));
vi.mock('../lib/native-experience', async importOriginal => ({ ...await importOriginal<typeof import('../lib/native-experience')>(), NativeExperience: { getPowerState: mock.get, addListener: mock.add } }));
import { usePowerState } from './usePowerState';
import { useMotion } from './useMotion';
const normal = { lowPowerMode: false, thermalState: 'nominal' };
beforeEach(() => { mock.native = true; mock.active = true; mock.get.mockReset().mockResolvedValue(normal); mock.remove.mockReset(); mock.add.mockReset().mockResolvedValue({ remove: mock.remove }); });
it('suppresses only decoration for low power and thermal pressure, with motion preference precedence', async () => {
  const { result, rerender } = renderHook(({ reduced }) => { const power = usePowerState(); return { power, motion: useMotion(reduced, power.savingPower) }; }, { initialProps: { reduced: false } });
  await waitFor(() => expect(mock.add).toHaveBeenCalledOnce());
  const emit = mock.add.mock.calls[0][1];
  for (const state of [{ lowPowerMode: true, thermalState: 'nominal' }, { lowPowerMode: false, thermalState: 'serious' }, { lowPowerMode: false, thermalState: 'critical' }]) {
    act(() => emit(state)); expect(result.current.motion.decorativeAnimate).toBe(false); expect(result.current.motion.animate).toBe(true);
  }
  act(() => emit({ lowPowerMode: false, thermalState: 'fair' })); expect(result.current.motion.decorativeAnimate).toBe(true);
  rerender({ reduced: true }); expect(result.current.motion.animate).toBe(false); expect(result.current.motion.decorativeAnimate).toBe(false);
});
it('rejects outdated reads after events and reconciles on foreground return', async () => {
  let resolve!: (value: unknown) => void; mock.get.mockImplementation(() => new Promise(r => { resolve = r; }));
  const { result } = renderHook(() => usePowerState());
  await act(async () => {});
  act(() => mock.add.mock.calls[0][1]({ ...normal, lowPowerMode: true }));
  await act(async () => resolve(normal)); expect(result.current.savingPower).toBe(true);
  act(() => { mock.active = false; window.dispatchEvent(new Event('activity')); });
  mock.get.mockResolvedValue(normal);
  act(() => { mock.active = true; window.dispatchEvent(new Event('activity')); });
  await waitFor(() => expect(result.current.savingPower).toBe(false));
});
it('removes delayed subscriptions after unmount and ignores invalid states and bridge failures', async () => {
  let subscribed!: (value: unknown) => void;
  mock.add.mockImplementationOnce(() => new Promise(r => { subscribed = r; })); mock.get.mockRejectedValue(new Error('missing plugin'));
  const { result, unmount } = renderHook(() => usePowerState());
  act(() => mock.add.mock.calls[0][1]({ lowPowerMode: 'yes', thermalState: 'invalid' })); expect(result.current.savingPower).toBe(false);
  unmount(); await act(async () => subscribed({ remove: mock.remove })); expect(mock.remove).toHaveBeenCalledOnce();
});
it('does not load the power bridge on the website', () => {
  mock.native = false; const { result } = renderHook(() => usePowerState()); expect(result.current.savingPower).toBe(false); expect(mock.get).not.toHaveBeenCalled(); expect(mock.add).not.toHaveBeenCalled();
});
