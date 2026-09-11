import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ native: true, active: true, set: vi.fn(), trigger: vi.fn() }));
vi.mock('./native', () => ({ isNativeApp: () => mock.native, isAppActive: () => mock.active, NATIVE_ACTIVITY_EVENT: '8bit-native-activity' }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ setHapticsEnabled: mock.set, triggerHaptic: mock.trigger }) }));
import { captureHapticContext, setHapticsEnabled, triggerHaptic } from './native-experience';
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
beforeEach(async () => { mock.native = true; mock.active = true; mock.set.mockReset().mockResolvedValue(undefined); mock.trigger.mockReset().mockResolvedValue(undefined); setHapticsEnabled(true); await flush(); });
it('gates feedback independently of audio and immediately respects disabling', async () => {
  triggerHaptic('impact'); await flush(); expect(mock.trigger).toHaveBeenCalledOnce();
  setHapticsEnabled(false); triggerHaptic('selection'); await flush(); expect(mock.trigger).toHaveBeenCalledOnce();
});
it('never calls native feedback on the website or in the background', async () => {
  mock.native = false; mock.set.mockClear(); setHapticsEnabled(true); triggerHaptic('impact'); await flush(); expect(mock.set).not.toHaveBeenCalled();
  mock.native = true; mock.active = false; triggerHaptic('impact'); await flush(); expect(mock.trigger).not.toHaveBeenCalled();
});
it('drops queued feedback after preference changes or backgrounding', async () => {
  let resolve!: () => void; mock.set.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
  setHapticsEnabled(true); await flush(); triggerHaptic('impact'); mock.active = false;
  resolve(); await flush(); expect(mock.trigger).not.toHaveBeenCalled();
  mock.active = true; triggerHaptic('impact'); setHapticsEnabled(false); await flush(); expect(mock.trigger).not.toHaveBeenCalled();
});
it('throttles chart feedback to 80 milliseconds without delaying navigation feedback', async () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(10000);
  triggerHaptic('selection', true); await flush();
  clock.mockReturnValue(10079); triggerHaptic('selection', true); await flush(); expect(mock.trigger).toHaveBeenCalledTimes(1);
  clock.mockReturnValue(10080); triggerHaptic('selection', true); await flush(); expect(mock.trigger).toHaveBeenCalledTimes(2);
  triggerHaptic('impact'); await flush(); expect(mock.trigger).toHaveBeenCalledTimes(3); clock.mockRestore();
});
it('contains native failures and recovers on the next configuration', async () => {
  mock.set.mockRejectedValueOnce(new Error('bridge unavailable')); setHapticsEnabled(true); triggerHaptic('impact'); await flush();
  expect(mock.trigger).not.toHaveBeenCalled();
  setHapticsEnabled(true); await flush(); mock.trigger.mockRejectedValueOnce(new Error('hardware unavailable')); triggerHaptic('impact'); await flush();
  expect(mock.trigger).toHaveBeenCalledOnce();
});

it('preserves typed impact, outcome, and custom pattern requests', async () => {
  const requests = [{ kind: 'impact', style: 'soft' }, { kind: 'impact', style: 'rigid' },
    { kind: 'notification', type: 'success' }, { kind: 'notification', type: 'warning' },
    { kind: 'notification', type: 'error' }, { kind: 'pattern', name: 'waterRipple' }] as const;
  for (const request of requests) triggerHaptic(request);
  await flush();
  expect(mock.trigger.mock.calls.map(([request]) => request)).toEqual(requests);
});
it('invalidates outcomes and queued patterns across background and foreground, even after resuming', async () => {
  const current = captureHapticContext();
  triggerHaptic({ kind: 'pattern', name: 'waterRipple' });
  mock.active = false; window.dispatchEvent(new Event('8bit-native-activity'));
  mock.active = true; window.dispatchEvent(new Event('8bit-native-activity'));
  await flush(); expect(current()).toBe(false); expect(mock.trigger).not.toHaveBeenCalled();
});
it('does not revive old outcomes after toggling feedback off and on', async () => {
  const current = captureHapticContext();
  setHapticsEnabled(false); setHapticsEnabled(true);
  await flush(); expect(current()).toBe(false);
});
it('drops a delayed pattern rather than playing it after the interaction', async () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(20000);
  triggerHaptic({ kind: 'pattern', name: 'waterRipple' });
  clock.mockReturnValue(20250);
  await flush(); expect(mock.trigger).not.toHaveBeenCalled(); clock.mockRestore();
});
