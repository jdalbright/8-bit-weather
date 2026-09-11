import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isAppActive, isNativeApp } from './native';

export type PowerState = { lowPowerMode: boolean; thermalState: 'nominal' | 'fair' | 'serious' | 'critical' };
export const normalPowerState: PowerState = { lowPowerMode: false, thermalState: 'nominal' };
export const NativeExperience = registerPlugin<{
  setHapticsEnabled(options: { enabled: boolean }): Promise<void>;
  triggerHaptic(options: { kind: 'selection' | 'impact' }): Promise<void>;
  getPowerState(): Promise<PowerState>;
  addListener(event: 'powerStateChanged', listener: (state: PowerState) => void): Promise<PluginListenerHandle>;
}>('NativeExperience');

let enabled = false;
let preferenceVersion = 0;
let configuration = Promise.resolve();
let lastChartPulse = -Infinity;
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
  preferenceVersion++;
  if (!isNativeApp()) return;
  configuration = configuration.catch(() => {}).then(() => NativeExperience.setHapticsEnabled({ enabled: value }));
  void configuration.catch(() => {});
}
export function triggerHaptic(kind: 'selection' | 'impact', chart = false): void {
  if (!isNativeApp() || !enabled || !isAppActive()) return;
  const now = performance.now();
  if (chart && now - lastChartPulse < 80) return;
  if (chart) lastChartPulse = now;
  const version = preferenceVersion;
  void configuration.then(() => {
    if (version === preferenceVersion && enabled && isAppActive() && performance.now() - now < 250) {
      return NativeExperience.triggerHaptic({ kind });
    }
  }).catch(() => {});
}
export function validPowerState(value: PowerState): boolean {
  return !!value && typeof value.lowPowerMode === 'boolean' && ['nominal', 'fair', 'serious', 'critical'].includes(value.thermalState);
}
