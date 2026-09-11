import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';

const NativeScroll = registerPlugin<{
  configure(options: { enabled: boolean; visible: boolean }): Promise<void>;
  finish(options: { requestId: number }): Promise<void>;
  addListener(event: 'refresh', listener: (event: { requestId: number }) => void): Promise<PluginListenerHandle>;
}>('NativeScroll');

// Serialize cleanup and setup across place switches and React StrictMode mounts.
let configuration = Promise.resolve();
function configure(enabled: boolean, visible = true) {
  configuration = configuration.catch(() => {}).then(() => NativeScroll.configure({ enabled, visible }));
  void configuration.catch(() => {});
}

export function NativePullToRefresh({ enabled, onRefresh, children }: {
  enabled: boolean; onRefresh: () => Promise<void>; children: ReactNode;
}) {
  const pending = useRef(false);
  const refresh = useEffectEvent(async (requestId: number) => {
    if (pending.current) return;
    pending.current = true;
    try { if (enabled && navigator.onLine && !document.hidden) await onRefresh(); }
    finally { pending.current = false; await NativeScroll.finish({ requestId }).catch(() => {}); }
  });
  useEffect(() => {
    let mounted = true;
    const listener = NativeScroll.addListener('refresh', ({ requestId }) => { if (mounted) void refresh(requestId).catch(() => {}); });
    void listener.catch(() => {});
    return () => {
      mounted = false;
      void listener.then(handle => handle.remove()).catch(() => {});
      configure(false, false);
    };
  }, []);
  useEffect(() => { configure(enabled); }, [enabled]);
  return children;
}
