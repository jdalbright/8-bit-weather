import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Geolocation } from '@capacitor/geolocation';
import type { Place } from '../types';

export const NATIVE_ACTIVITY_EVENT = '8bit-native-activity';
export const NATIVE_PLACE_EVENT = '8bit-native-place';
export function isNativeApp(): boolean { return Capacitor.isNativePlatform() || import.meta.env.MODE === 'native' || import.meta.env.VITE_NATIVE === 'true'; }
let nativeActive = true;
let launchPlaceId: string | null = null;
export function isAppActive(): boolean { return nativeActive && !document.hidden; }
export function takeLaunchPlaceId(): string | null { const id = launchPlaceId; launchPlaceId = null; return id; }
export function placeIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'eightbitweather:' || url.hostname !== 'place' || (url.pathname !== '' && url.pathname !== '/')) return null;
    const id = url.searchParams.get('id');
    return id && id.length <= 256 ? id : null;
  } catch { return null; }
}
/** Set up native events before React mounts, retaining cold-start links until the app is ready. */
export async function initializeNative(): Promise<void> {
  if (!isNativeApp()) return;
  document.documentElement.classList.add('native-app');
  await App.addListener('appStateChange', ({ isActive }) => {
    nativeActive = isActive;
    window.dispatchEvent(new Event(NATIVE_ACTIVITY_EVENT));
  });
  let receivedLiveLink = false;
  await App.addListener('appUrlOpen', ({ url }) => {
    const id = placeIdFromUrl(url);
    if (id) { receivedLiveLink = true; launchPlaceId = id; window.dispatchEvent(new CustomEvent(NATIVE_PLACE_EVENT, { detail: id })); }
  });
  const launch = await App.getLaunchUrl();
  if (!receivedLiveLink && launch?.url) launchPlaceId = placeIdFromUrl(launch.url);
}
export async function locateNative(): Promise<Place> {
  try {
    let permission = await Geolocation.checkPermissions();
    if (permission.location === 'prompt' || permission.location === 'prompt-with-rationale') permission = await Geolocation.requestPermissions({ permissions: ['location'] });
    if (permission.location === 'denied') throw new Error('Location permission is off. Allow location in iPhone Settings, or search for a city.');
    const { coords } = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    return { id: 'current-location', name: 'Current location', latitude: Number(coords.latitude.toFixed(3)), longitude: Number(coords.longitude.toFixed(3)), source: 'gps' };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'OS-PLUG-GLOC-0003') throw new Error('Location permission is off. Allow location in iPhone Settings, or search for a city.');
    if (code === 'OS-PLUG-GLOC-0007' || code === 'OS-PLUG-GLOC-0009') throw new Error('Location Services are off. Enable them in iPhone Settings, or search for a city.');
    if (code === 'OS-PLUG-GLOC-0010') throw new Error('Finding your location took too long. Try again, or search for a city.');
    if (error instanceof Error && error.message.startsWith('Location permission')) throw error;
    throw new Error('Couldn’t find your location. Try again, or search for a city.');
  }
}
