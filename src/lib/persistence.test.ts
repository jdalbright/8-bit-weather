import { beforeEach, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ enabled: true, stored: new Map<string, string>(), set: vi.fn(), get: vi.fn(), remove: vi.fn() }));
vi.mock('./native', () => ({ isNativeApp: () => native.enabled }));
vi.mock('@capacitor/preferences', () => ({ Preferences: {
  keys: async () => ({ keys: [...native.stored.keys()] }),
  get: native.get, set: native.set, remove: native.remove,
} }));
beforeEach(() => {
  vi.resetModules(); native.enabled = true; native.stored.clear();
  native.get.mockReset().mockImplementation(async ({ key }) => ({ value: native.stored.get(key) ?? null }));
  native.set.mockReset().mockImplementation(async ({ key, value }) => { native.stored.set(key, value); });
  native.remove.mockReset().mockImplementation(async ({ key }) => { native.stored.delete(key); });
});
it('hydrates native preferences ahead of stale WebKit data and migrates only absent app keys', async () => {
  native.stored.set('8bit-weather:v1', 'native');
  localStorage.setItem('8bit-weather:v1', 'old-web'); localStorage.setItem('8bit-weather:briefings:v1', 'briefings'); localStorage.setItem('another-app', 'private');
  const storage = await import('./persistence'); await storage.hydrateNativeStorage();
  expect(storage.readStoredValue('8bit-weather:v1')).toBe('native');
  expect(native.stored.get('8bit-weather:briefings:v1')).toBe('briefings');
  expect(native.stored.has('another-app')).toBe(false);
});
it('serializes writes and clear, with reads available before asynchronous writes finish', async () => {
  const storage = await import('./persistence'); await storage.hydrateNativeStorage();
  storage.writeStoredValue('8bit-weather:v1', 'first');
  expect(storage.readStoredValue('8bit-weather:v1')).toBe('first');
  storage.writeStoredValue('8bit-weather:v1', 'last'); storage.removeStoredValue('8bit-weather:v1');
  await storage.flushNativeStorage(); expect(native.stored.has('8bit-weather:v1')).toBe(false);
  expect(native.set.mock.calls.map(([arg]) => arg.value)).toEqual(['first', 'last']);
});
it('refuses destructive durable writes after hydration fails', async () => {
  native.stored.set('8bit-weather:v1', 'keep'); native.get.mockRejectedValueOnce(new Error('Unavailable'));
  const storage = await import('./persistence'); await expect(storage.hydrateNativeStorage()).rejects.toThrow('Saved data');
  expect(storage.hasLoadedNativeStorage()).toBe(false);
  expect(storage.writeStoredValue('8bit-weather:v1', 'defaults')).toBe(false);
  storage.removeStoredValue('8bit-weather:v1'); await storage.flushNativeStorage();
  expect(native.stored.get('8bit-weather:v1')).toBe('keep');
});
it('reports native write errors and continues later queued operations', async () => {
  const storage = await import('./persistence'); await storage.hydrateNativeStorage();
  const onError = vi.fn(); window.addEventListener(storage.PERSISTENCE_ERROR_EVENT, onError);
  native.set.mockRejectedValueOnce(new Error('Unavailable')); storage.writeStoredValue('8bit-weather:v1', 'first'); storage.writeStoredValue('8bit-weather:v1', 'retry');
  await storage.flushNativeStorage(); expect(onError).toHaveBeenCalledOnce(); expect(native.stored.get('8bit-weather:v1')).toBe('retry');
  window.removeEventListener(storage.PERSISTENCE_ERROR_EVENT, onError);
});
it('preserves synchronous web storage behavior without native plugin calls', async () => {
  native.enabled = false; const storage = await import('./persistence'); await storage.hydrateNativeStorage();
  expect(storage.writeStoredValue('8bit-weather:v1', 'web')).toBe(true); expect(localStorage.getItem('8bit-weather:v1')).toBe('web'); expect(native.set).not.toHaveBeenCalled();
});
