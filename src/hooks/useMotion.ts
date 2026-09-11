import { isAppActive, NATIVE_ACTIVITY_EVENT } from '../lib/native';
import { useEffect, useState } from 'react';
export function useMotion(reduced: boolean) {
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(isAppActive);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    const visibility = () => setVisible(isAppActive());
    window.addEventListener(NATIVE_ACTIVITY_EVENT, visibility); media.addEventListener('change', update); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener(NATIVE_ACTIVITY_EVENT, visibility); media.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return { animate: !reduced && !systemReduced && visible, systemReduced, visible };
}
