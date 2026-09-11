import { beforeEach, expect, it, vi } from 'vitest';
vi.hoisted(() => vi.resetModules());
const bridge = vi.hoisted(() => ({ listeners: new Map<string, (event: never) => void>(), launch: undefined as { url: string } | undefined, launchResult: null as Promise<{ url: string }> | null, permission: vi.fn(), request: vi.fn(), position: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: async (name: string, callback: (event: never) => void) => { bridge.listeners.set(name, callback); },
  getLaunchUrl: async () => bridge.launchResult ?? bridge.launch,
} }));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { checkPermissions: bridge.permission, requestPermissions: bridge.request, getCurrentPosition: bridge.position } }));
import { initializeNative, isAppActive, locateNative, NATIVE_ACTIVITY_EVENT, NATIVE_PLACE_EVENT, placeIdFromUrl, takeLaunchPlaceId } from './native';
beforeEach(() => {
  bridge.listeners.clear(); bridge.launch = undefined; bridge.launchResult = null; bridge.permission.mockReset().mockResolvedValue({ location: 'granted' }); bridge.request.mockReset();
  bridge.position.mockReset().mockResolvedValue({ coords: { latitude: 35.123456, longitude: -78.123456 } });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
it('allows only the app place deep-link route and retains cold/warm links for React', async () => {
  expect(placeIdFromUrl('https://example.com/place?id=1')).toBeNull(); expect(placeIdFromUrl('eightbitweather://evil?id=1')).toBeNull();
  expect(placeIdFromUrl('eightbitweather://place/extra?id=1')).toBeNull(); expect(placeIdFromUrl('eightbitweather://place')).toBeNull();
  bridge.launch = { url: 'eightbitweather://place?id=city%20one' }; await initializeNative(); expect(takeLaunchPlaceId()).toBe('city one'); expect(takeLaunchPlaceId()).toBeNull();
  const opened = vi.fn(); window.addEventListener(NATIVE_PLACE_EVENT, opened);
  bridge.listeners.get('appUrlOpen')!({ url: 'eightbitweather://place?id=two' } as never);
  expect(opened).toHaveBeenCalledOnce(); expect(takeLaunchPlaceId()).toBe('two'); window.removeEventListener(NATIVE_PLACE_EVENT, opened);
});
it('propagates background/resume even when WKWebView visibility remains visible', async () => {
  await initializeNative(); const changed = vi.fn(); window.addEventListener(NATIVE_ACTIVITY_EVENT, changed);
  bridge.listeners.get('appStateChange')!({ isActive: false } as never); expect(isAppActive()).toBe(false);
  bridge.listeners.get('appStateChange')!({ isActive: true } as never); expect(isAppActive()).toBe(true); expect(changed).toHaveBeenCalledTimes(2);
  window.removeEventListener(NATIVE_ACTIVITY_EVENT, changed);
});
it('requests native permission only when prompted and rounds precise coordinates', async () => {
  bridge.permission.mockResolvedValue({ location: 'prompt' }); bridge.request.mockResolvedValue({ location: 'granted' });
  expect(await locateNative()).toMatchObject({ source: 'gps', latitude: 35.123, longitude: -78.123 }); expect(bridge.request).toHaveBeenCalledWith({ permissions: ['location'] });
});
it('handles native denial without requesting a position or repeatedly prompting', async () => {
  bridge.permission.mockResolvedValue({ location: 'denied' }); await expect(locateNative()).rejects.toThrow('iPhone Settings'); expect(bridge.position).not.toHaveBeenCalled(); expect(bridge.request).not.toHaveBeenCalled();
});

it('keeps a newer appUrlOpen event when historical launch lookup resolves afterward', async () => {
  let resolveLaunch!: (value: { url: string }) => void;
  bridge.launchResult = new Promise(resolve => { resolveLaunch = resolve; });
  const initialization = initializeNative();
  await vi.waitFor(() => expect(bridge.listeners.has('appUrlOpen')).toBe(true));
  bridge.listeners.get('appUrlOpen')!({ url: 'eightbitweather://place?id=new' } as never);
  resolveLaunch({ url: 'eightbitweather://place?id=old' }); await initialization;
  expect(takeLaunchPlaceId()).toBe('new');
});
