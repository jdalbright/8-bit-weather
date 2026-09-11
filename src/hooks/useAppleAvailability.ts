import { useEffect, useState } from 'react';
import { appleAvailability, type AppleAvailability } from '../lib/apple-briefing';
import { isAppActive, NATIVE_ACTIVITY_EVENT } from '../lib/native';

export function useAppleAvailability(enabled: boolean) {
  const [status, setStatus] = useState<AppleAvailability | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let sequence = 0;
    let timer: number | undefined;
    const check = () => {
      const request = ++sequence;
      window.clearTimeout(timer);
      if (!isAppActive()) return;
      timer = window.setTimeout(() => {
        if (sequence === request) { sequence++; setStatus({ available: false }); }
      }, 5000);
      void appleAvailability().then(value => {
        if (sequence === request) { window.clearTimeout(timer); setStatus(value); }
      }, () => {
        if (sequence === request) { window.clearTimeout(timer); setStatus({ available: false }); }
      });
    };
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener(NATIVE_ACTIVITY_EVENT, check);
    return () => {
      sequence++; window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener(NATIVE_ACTIVITY_EVENT, check);
    };
  }, [enabled]);
  return enabled ? status : null;
}
