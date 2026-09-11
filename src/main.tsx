import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import App from './App';
import './styles.css';
import { initializeNative } from './lib/native';
import { hydrateNativeStorage } from './lib/persistence';

async function bootstrap() {
  // Never mount before durable preferences are hydrated: mount effects save state.
  await hydrateNativeStorage().catch(() => { document.documentElement.dataset.storageUnavailable = 'true'; });
  await initializeNative().catch(() => { /* Shared screens remain usable when a native plugin fails. */ });
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><App /></React.StrictMode>,
  );
}
void bootstrap();
