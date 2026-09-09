import { BRIEFING_PATH, BRIEFING_STORAGE, isWeatherBriefing, type BriefingForecast, type WeatherBriefing } from './briefing';

interface Cached { key: string; scope: string; briefing: WeatherBriefing }
let memory: Cached[] = [];
let epoch = 0;
type Pending = { controller: AbortController; promise: Promise<WeatherBriefing>; users: number };
const pending = new Map<string, Pending>();
const failures = new Map<string, BriefingError>();
let limitedUntil = 0;
export class BriefingError extends Error {
  constructor(public code = 'unavailable', public retryAt = Date.now() + 60000) {
    super(code === 'rate_limited' ? 'Briefings are busy. Try again in a moment.' : 'The briefing is unavailable right now. Your forecast is still here.');
  }
}

function entries(): Cached[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(BRIEFING_STORAGE) ?? '[]');
    if (Array.isArray(stored)) {
      const valid = stored.filter((e): e is Cached => !!e && typeof e.key === 'string' && typeof e.scope === 'string' && isWeatherBriefing(e.briefing));
      memory = [...memory, ...valid.filter(e => !memory.some(m => m.key === e.key))].slice(0, 12);
    }
  } catch { /* In-memory caching still works when storage is unavailable. */ }
  return memory;
}
export function cachedBriefing(key: string, scope: string, now: number, offline: boolean): WeatherBriefing | null {
  return entries().find(e => (offline ? e.scope === scope : e.key === key)
    && e.briefing.generatedAt <= now && now >= e.briefing.windowStart && now < e.briefing.windowEnd
    && (offline || now < e.briefing.expiresAt))?.briefing ?? null;
}
export function clearBriefingCache() {
  epoch++; memory = []; failures.clear(); limitedUntil = 0;
  for (const job of pending.values()) job.controller.abort();
  pending.clear();
  try { localStorage.removeItem(BRIEFING_STORAGE); } catch { /* Optional storage. */ }
}

export function acquireBriefing(key: string, scope: string, forecast: BriefingForecast, retry = false) {
  let job = pending.get(key);
  if (!job) {
    const controller = new AbortController();
    const requestEpoch = epoch;
    const promise = (async () => {
      const failure = failures.get(key);
      if (limitedUntil > Date.now()) throw new BriefingError('rate_limited', limitedUntil);
      if (failure && (!retry || failure.retryAt > Date.now())) throw failure;
      let timedOut = false;
      const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
      try {
        const response = await fetch(BRIEFING_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(forecast), signal: controller.signal });
        if (response.status === 429) {
          const header = response.headers.get('Retry-After');
          const seconds = header ? Number(header) : NaN;
          const delay = Number.isFinite(seconds) ? seconds * 1000 : header ? Date.parse(header) - Date.now() : 60000;
          limitedUntil = Date.now() + Math.max(60000, Number.isFinite(delay) ? delay : 60000);
          throw new BriefingError('rate_limited', limitedUntil);
        }
        if (!response.ok) throw new BriefingError();
        const value: unknown = await response.json();
        if (!isWeatherBriefing(value) || value.generatedAt > Date.now() + 60000 || value.expiresAt <= Date.now()) throw new BriefingError();
        if (controller.signal.aborted || requestEpoch !== epoch) throw new DOMException('Superseded', 'AbortError');
        memory = [{ key, scope, briefing: value }, ...entries().filter(e => e.key !== key)].slice(0, 12);
        try { localStorage.setItem(BRIEFING_STORAGE, JSON.stringify(memory)); } catch { /* Use memory instead. */ }
        failures.delete(key);
        return value;
      } catch (error) {
        const failure = error instanceof BriefingError ? error : new BriefingError();
        // An abandoned view can try again on return; a provider failure requires an explicit retry.
        if (!controller.signal.aborted || timedOut) {
          failures.set(key, failure);
          if (failures.size > 24) failures.delete(failures.keys().next().value!);
        }
        throw failure;
      } finally { window.clearTimeout(timeout); }
    })();
    job = { controller, promise, users: 0 };
    pending.set(key, job);
    const created = job;
    // Use then's rejection handler so cleanup never creates an unhandled rejected promise.
    void promise.then(() => { if (pending.get(key) === created) pending.delete(key); }, () => { if (pending.get(key) === created) pending.delete(key); });
  }
  job.users++;
  const acquired = job;
  return { promise: job.promise, release() {
    acquired.users--;
    // React StrictMode re-subscribes synchronously; preserve that request.
    queueMicrotask(() => {
      if (!acquired.users && pending.get(key) === acquired) { pending.delete(key); acquired.controller.abort(); }
    });
  } };
}
