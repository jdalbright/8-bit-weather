import { useEffect, useState } from 'react';
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
export function useInstall() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const before = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', before); window.addEventListener('appinstalled', complete);
    return () => { window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', complete); };
  }, []);
  async function install() {
    setError(null);
    if (!prompt) { setShowHelp(true); return; }
    try { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
    catch { setError('Open your browser menu to install this app.'); setShowHelp(true); }
  }
  return { installed, canPrompt: !!prompt, showHelp, setShowHelp, ios, install, error };
}
