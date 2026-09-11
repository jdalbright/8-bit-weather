import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isAppActive, isNativeApp, NATIVE_ACTIVITY_EVENT } from './native';

export type ImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';
export type HapticRequest = { kind: 'selection' } | { kind: 'impact'; style?: ImpactStyle }
  | { kind: 'notification'; type: 'success' | 'warning' | 'error' } | { kind: 'pattern'; name: 'waterRipple' };

export type PowerState = { lowPowerMode: boolean; thermalState: 'nominal' | 'fair' | 'serious' | 'critical' };
export const normalPowerState: PowerState = { lowPowerMode: false, thermalState: 'nominal' };
export const NativeExperience = registerPlugin<{
  setHapticsEnabled(options: { enabled: boolean }): Promise<void>;
  triggerHaptic(options: HapticRequest): Promise<void>;
  getPowerState(): Promise<PowerState>;
  addListener(event: 'powerStateChanged', listener: (state: PowerState) => void): Promise<PluginListenerHandle>;
}>('NativeExperience');

let enabled = false;
let preferenceVersion = 0;
let configuration = Promise.resolve();
let lastChartPulse = -Infinity;
let activityVersion = 0;
const activityChanged = () => { if (!isAppActive()) activityVersion++; };
window.addEventListener(NATIVE_ACTIVITY_EVENT, activityChanged);
document.addEventListener('visibilitychange', activityChanged);
/** Async outcomes must still belong to the same foreground/preference session. */
export function captureHapticContext(): () => boolean {
  const preference = preferenceVersion, activity = activityVersion;
  return () => preference === preferenceVersion && activity === activityVersion && enabled && isAppActive();
}
export function setHapticsEnabled(value: boolean): void {
  if (enabled !== value) preferenceVersion++;
  enabled = value;
  if (!isNativeApp()) return;
  configuration = configuration.catch(() => {}).then(() => NativeExperience.setHapticsEnabled({ enabled: value }));
  void configuration.catch(() => {});
}
export function triggerHaptic(request: 'selection' | 'impact' | HapticRequest, chart = false): void {
  if (!isNativeApp() || !enabled || !isAppActive()) return;
  const now = performance.now();
  if (chart && now - lastChartPulse < 80) return;
  if (chart) lastChartPulse = now;
  const current = captureHapticContext();
  const options: HapticRequest = typeof request === 'string' ? { kind: request } : request;
  void configuration.then(() => {
    if (current() && performance.now() - now < 250) {
      return NativeExperience.triggerHaptic(options);
    }
  }).catch(() => {});
}
export function validPowerState(value: PowerState): boolean {
  return !!value && typeof value.lowPowerMode === 'boolean' && ['nominal', 'fair', 'serious', 'critical'].includes(value.thermalState);
}
