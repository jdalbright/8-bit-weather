import type { Page } from '@playwright/test';
import { asheville, tokyo } from '../src/test/fixtures';

export const storageKey = '8bit-weather:v1';
export const preferences = { briefingProvider: 'openai', units: 'imperial', music: true, ambience: true, effects: true, musicVolume: .35, ambienceVolume: .25, effectsVolume: .4, reducedMotion: true };
export const savedState = { preferences, places: [asheville, tokyo], selected: asheville };

type Call = { plugin: string; method: string; options?: Record<string, unknown> };
export type WidgetPayload = { place: { id: string }; units: string; landscape: string; weather: { placeId: string; current: { temperature: number }; daily: { high: number; low: number }[] } | null };
type Reply = { result?: unknown; error?: { message: string; code?: string } };
declare global {
  interface Window {
    __nativeInvoke: (call: Call) => Promise<Reply>;
    __emitNative: (event: string, payload: unknown) => void;
    __serviceWorkerRegistrations: number;
    __nativeAudioContexts: AudioContext[];
  }
}

/** Node-owned Preferences survive JS context replacement without using localStorage.
 * Only transport is mocked: the production Capacitor plugin proxies still execute. */
export async function installBridge(page: Page, initial: Record<string, string> = { [storageKey]: JSON.stringify(savedState) }) {
  // Every cloud request is intercepted; individual briefing tests can override
  // this route with their controlled response. Other native tests remain offline.
  await page.route('https://weather.example/api/weather-briefing', route => route.fulfill({
    status: 503, headers: { 'access-control-allow-origin': '*' }, json: { code: 'unavailable' },
  }));
  const store = new Map(Object.entries(initial));
  const calls: Call[] = [];
  const widgets: (WidgetPayload | null)[] = [];
  const control = { launchUrl: '', permission: 'granted', positionError: '', failReads: false, failWrites: false, hydrationDelayMs: 0,
    appleAvailable: false, appleOSMajor: 27, appleError: '', appleHang: false, appleText: 'Temperatures stay mild today. Bring a light layer tonight.' };
  const pendingApple = new Map<string, (reply: Reply) => void>();
  await page.exposeFunction('__nativeInvoke', async (call: Call): Promise<Reply> => {
    calls.push(call);
    const { plugin, method, options = {} } = call;
    if (plugin === 'Preferences') {
      if (['get', 'keys'].includes(method) && control.failReads) return { error: { message: 'Preferences unavailable' } };
      if (method === 'keys') return { result: { keys: [...store.keys()] } };
      if (method === 'get') {
        if (control.hydrationDelayMs) await new Promise(resolve => setTimeout(resolve, control.hydrationDelayMs));
        return { result: { value: store.get(String(options.key)) ?? null } };
      }
      if (control.failWrites) return { error: { message: 'Preferences write failed' } };
      if (method === 'set') store.set(String(options.key), String(options.value));
      if (method === 'remove') store.delete(String(options.key));
      return { result: {} };
    }
    if (plugin === 'App' && method === 'getLaunchUrl') return { result: control.launchUrl ? { url: control.launchUrl } : {} };
    if (plugin === 'AppleBriefing') {
      if (method === 'availability') return { result: { available: control.appleAvailable && control.appleOSMajor >= 27,
        modelOSMajor: control.appleOSMajor, reason: control.appleOSMajor < 27 ? 'requires_ios27' : 'device_unsupported' } };
      if (method === 'cancel') {
        pendingApple.get(String(options.requestId))?.({ error: { message: 'Cancelled', code: 'CANCELLED' } });
        pendingApple.delete(String(options.requestId));
        return { result: {} };
      }
      if (control.appleHang) return new Promise(resolve => pendingApple.set(String(options.requestId), resolve));
      return control.appleError ? { error: { message: 'Local generation failed', code: control.appleError } } : { result: { text: control.appleText } };
    }
    if (plugin === 'Geolocation') {
      if (method === 'checkPermissions' || method === 'requestPermissions') return { result: { location: control.permission, coarseLocation: control.permission } };
      if (control.positionError) return { error: { message: 'Native location failed', code: control.positionError } };
      return { result: { coords: { latitude: 35.595123, longitude: -82.551567 } } };
    }
    if (plugin === 'WeatherWidget') widgets.push(method === 'clear' ? null : JSON.parse(String(options.payload)));
    return { result: {} };
  });
  await page.addInitScript(() => {
    const listeners = new Map<string, ((payload: unknown) => void)[]>();
    const methods: Record<string, string[]> = {
      Preferences: ['keys', 'get', 'set', 'remove'],
      App: ['getLaunchUrl', 'removeListener'],
      Geolocation: ['checkPermissions', 'requestPermissions', 'getCurrentPosition'],
      WeatherWidget: ['update', 'clear'],
      NativeScroll: ['configure', 'finish', 'removeListener'],
      AppleBriefing: ['availability', 'generate', 'cancel'],
    };
    Object.assign(window, {
      CapacitorCustomPlatform: { name: 'ios' },
      Capacitor: {
        PluginHeaders: Object.entries(methods).map(([name, names]) => ({ name, methods: [
          ...names.map(name => ({ name, rtype: 'promise' })),
          ...(['App', 'NativeScroll'].includes(name) ? [{ name: 'addListener', rtype: 'callback' }] : []),
        ] })),
        nativePromise: async (plugin: string, method: string, options?: Record<string, unknown>) => {
          const reply = await window.__nativeInvoke({ plugin, method, options });
          if (reply.error) throw Object.assign(new Error(reply.error.message), { code: reply.error.code });
          return reply.result;
        },
        nativeCallback: (_plugin: string, _method: string, options: { eventName: string }, callback: (payload: unknown) => void) => {
          listeners.set(options.eventName, [...(listeners.get(options.eventName) ?? []), callback]);
          return Promise.resolve(`${options.eventName}-${listeners.size}`);
        },
      },
    });
    window.__emitNative = (event, payload) => listeners.get(event)?.forEach(callback => callback(payload));
    window.__serviceWorkerRegistrations = 0;
    if (navigator.serviceWorker) {
      const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = (...args) => { window.__serviceWorkerRegistrations++; return register(...args); };
    }
    const NativeAudioContext = window.AudioContext;
    window.__nativeAudioContexts = [];
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) { super(options); window.__nativeAudioContexts.push(this); }
    };
  });
  return { store, calls, widgets, control };
}
