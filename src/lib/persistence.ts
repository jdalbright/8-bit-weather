import { Preferences } from '@capacitor/preferences';
import { isNativeApp } from './native';

const PREFIX = '8bit-weather:';
const values = new Map<string, string>();
let writes: Promise<void> = Promise.resolve();
let writable = true;
export const PERSISTENCE_ERROR_EVENT = '8bit-persistence-error';
function failed() { window.dispatchEvent(new Event(PERSISTENCE_ERROR_EVENT)); }
/** Hydration is awaited before the first state read or React write effect. */
export async function hydrateNativeStorage(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { keys } = await Preferences.keys();
    const stored = await Promise.all(keys.filter(key => key.startsWith(PREFIX)).map(async key => [key, (await Preferences.get({ key })).value] as const));
    values.clear();
    for (const [key, value] of stored) if (value !== null) values.set(key, value);
    // Migrate only keys absent in durable storage, never overwrite a native value.
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(PREFIX) || values.has(key)) continue;
        const value = localStorage.getItem(key);
        if (value !== null) { await Preferences.set({ key, value }); values.set(key, value); }
      }
    } catch { /* Native preferences remain usable if WebKit storage is unavailable. */ }
  } catch {
    writable = false; // A failed read must never overwrite existing durable user data.
    throw new Error('Saved data could not be opened. Changes will last for this session.');
  }
}
/** A failed hydration leaves saved native data intact; callers must not replace related shared data. */
export function hasLoadedNativeStorage(): boolean { return !isNativeApp() || writable; }
export function readStoredValue(key: string): string | null {
  if (isNativeApp()) return values.get(key) ?? null;
  try { return localStorage.getItem(key); } catch { return null; }
}
function enqueue(operation: () => Promise<void>): boolean {
  if (!writable) return false;
  writes = writes.then(operation).catch(failed);
  return true;
}
export function writeStoredValue(key: string, value: string): boolean {
  if (isNativeApp()) { values.set(key, value); return enqueue(() => Preferences.set({ key, value })); }
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
export function removeStoredValue(key: string): void {
  if (isNativeApp()) { values.delete(key); enqueue(() => Preferences.remove({ key })); }
  try { localStorage.removeItem(key); } catch { /* Optional WebKit cache. */ }
}
/** Useful for lifecycle integration and deterministic persistence verification. */
export async function flushNativeStorage(): Promise<void> { await writes; }
