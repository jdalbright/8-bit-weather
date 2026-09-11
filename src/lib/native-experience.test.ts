import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ native: true, active: true, set: vi.fn(), trigger: vi.fn() }));
vi.mock('./native', () => ({ isNativeApp: () => mock.native, isAppActive: () => mock.active }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ setHapticsEnabled: mock.set, triggerHaptic: mock.trigger }) }));
import { setHapticsEnabled, triggerHaptic } from './native-experience';
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
