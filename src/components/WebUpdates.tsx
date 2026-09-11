import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from './Icons';

/** This component is loaded only by the web application. */
export default function WebUpdates() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();
  return needRefresh ? <div className="update-notice" role="status"><span>A fresh version is ready.</span><button className="text-button" onClick={() => void updateServiceWorker(true)}>Update app</button><button className="icon-button" aria-label="Dismiss update" onClick={() => setNeedRefresh(false)}><Icon name="close" size={14}/></button></div> : null;
}
