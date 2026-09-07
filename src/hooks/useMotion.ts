import { useEffect, useState } from 'react';
export function useMotion(reduced: boolean) {
  const [systemReduced, setSystemReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    media.addEventListener('change', update); document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  return { animate: !reduced && !systemReduced && visible, systemReduced, visible };
}
