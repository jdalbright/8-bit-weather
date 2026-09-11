import { useEffect, useState } from 'react';
import { isAppActive, isNativeApp, NATIVE_ACTIVITY_EVENT } from '../lib/native';
import { NativeExperience, normalPowerState, validPowerState, type PowerState } from '../lib/native-experience';

export function usePowerState() {
  const [state, setState] = useState<PowerState>(normalPowerState);
  useEffect(() => {
    if (!isNativeApp()) return;
    let mounted = true;
    let revision = 0;
    const accept = (value: PowerState) => {
      if (mounted && validPowerState(value)) setState(value);
    };
    const read = () => {
      if (!isAppActive()) { revision++; return; }
      const request = ++revision;
      void NativeExperience.getPowerState().then(value => {
        if (request === revision) accept(value);
      }).catch(() => {});
    };
    const listener = NativeExperience.addListener('powerStateChanged', value => { revision++; accept(value); });
    void listener.then(() => { if (mounted) read(); }).catch(() => {});
    read();
    window.addEventListener(NATIVE_ACTIVITY_EVENT, read);
    document.addEventListener('visibilitychange', read);
    return () => {
      mounted = false; revision++;
      window.removeEventListener(NATIVE_ACTIVITY_EVENT, read);
      document.removeEventListener('visibilitychange', read);
      void listener.then(handle => handle.remove()).catch(() => {});
    };
  }, []);
  const savingPower = state.lowPowerMode || state.thermalState === 'serious' || state.thermalState === 'critical';
  return { ...state, savingPower };
}
