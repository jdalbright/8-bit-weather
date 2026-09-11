import { useEffect, useState } from 'react';
import type { SceneState } from '../types';

/** Leave visuals responsive while avoiding a music transition for every dragged step. */
export function usePreviewAudioScene(current: SceneState, preview: SceneState | null, placeKey: string): SceneState {
  const [settled, setSettled] = useState<{ scene: SceneState; placeKey: string } | null>(null);
  useEffect(() => {
    if (!preview) { setSettled(null); return; }
    const timer = window.setTimeout(() => setSettled({ scene: preview, placeKey }), 200);
    return () => window.clearTimeout(timer);
  }, [preview, placeKey]);
  return preview && settled?.placeKey === placeKey ? settled.scene : current;
}
