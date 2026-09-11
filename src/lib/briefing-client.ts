import { BRIEFING_PATH, BRIEFING_STORAGE, forecastUsable, isWeatherBriefing, parseBriefingForecast, type BriefingForecast, type WeatherBriefing } from './briefing';
import { isAppActive, isNativeApp } from './native';
import { generateAppleBriefing, MIN_APPLE_MODEL_OS } from './apple-briefing';
import { readStoredValue, writeStoredValue, removeStoredValue } from './persistence';

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

export function briefingEndpoint(): string {
  if (!isNativeApp()) return BRIEFING_PATH;
  // The packaged app cannot resolve a relative serverless API route. Only a
  // public HTTPS endpoint is shipped; provider keys stay on that server.
  const configured = import.meta.env.VITE_NATIVE_BRIEFING_URL;
  try {
    const url = new URL(configured);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === BRIEFING_PATH) return url.href;
  } catch { /* Missing or invalid native configuration is recoverable. */ }
  throw new BriefingError('unconfigured');
}

function entries(): Cached[] {
  try {
    const stored: unknown = JSON.parse(readStoredValue(BRIEFING_STORAGE) ?? '[]');
    if (Array.isArray(stored)) {
      const valid = stored.filter((e): e is Cached => !!e && typeof e.key === 'string' && typeof e.scope === 'string' && isWeatherBriefing(e.briefing)
        // Drop earlier Apple evaluations while retaining legacy OpenAI entries.
        && (e.briefing.provider !== 'apple' || (e.briefing.appleModelOSMajor ?? 0) >= MIN_APPLE_MODEL_OS));
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
  removeStoredValue(BRIEFING_STORAGE);
}

async function openAIBriefing(forecast: BriefingForecast, signal: AbortSignal): Promise<WeatherBriefing> {
  if (limitedUntil > Date.now()) throw new BriefingError('rate_limited', limitedUntil);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  let timer: number | undefined;
  let stop: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    stop = () => reject(new DOMException('Aborted', 'AbortError'));
    controller.signal.addEventListener('abort', stop, { once: true });
    timer = window.setTimeout(abort, 15000);
    if (signal.aborted) abort();
  });
  const request = async () => {
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const response = await fetch(briefingEndpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(forecast), signal: controller.signal, credentials: 'omit', redirect: 'error' });
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
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
    return { ...value, provider: 'openai' as const };
  };
  try { return await Promise.race([request(), interrupted]); }
  finally {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', stop);
  }
}

export function acquireBriefing(key: string, scope: string, forecast: BriefingForecast, retry = false, online = navigator.onLine) {
  // Network availability changes may retry a previously offline failure, while
  // stored briefings remain independent of connectivity and provider.
  const requestKey = JSON.stringify([key, online]);
  let job = pending.get(requestKey);
  if (!job) {
    const controller = new AbortController();
    const requestEpoch = epoch;
    const checkActive = () => {
      if (!isAppActive()) controller.abort();
      if (controller.signal.aborted || requestEpoch !== epoch) throw new DOMException('Superseded', 'AbortError');
    };
    const promise = (async () => {
      try {
        const saved = cachedBriefing(key, scope, Date.now(), !online);
        if (saved) return saved;
        const failure = failures.get(requestKey);
        if (failure && (!retry || failure.retryAt > Date.now())) throw failure;
        const parsed = parseBriefingForecast(forecast);
        if (!parsed || !forecastUsable(parsed, Date.now())) throw new BriefingError('forecast_unavailable');
        let value: WeatherBriefing | undefined;
        if (isNativeApp()) {
          try { value = await generateAppleBriefing(parsed, controller.signal); }
          catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') controller.abort();
            checkActive(); /* Unavailable or failed locally: try the configured cloud provider. */
          }
        }
        checkActive();
        if (!value) {
          if (!online || !navigator.onLine) throw new BriefingError('offline');
          // Recheck after local generation; never send an expired forecast to fallback.
          if (!forecastUsable(parsed, Date.now())) throw new BriefingError('forecast_unavailable');
          value = await openAIBriefing(parsed, controller.signal);
        }
        checkActive();
        if (!forecastUsable(parsed, Date.now())) throw new BriefingError('forecast_unavailable');
        memory = [{ key, scope, briefing: value }, ...entries().filter(e => e.key !== key)].slice(0, 12);
        writeStoredValue(BRIEFING_STORAGE, JSON.stringify(memory));
        failures.delete(requestKey);
        return value;
      } catch (error) {
        const failure = error instanceof BriefingError ? error : new BriefingError();
        // Abandoned views can try again on return; provider failures need explicit retry.
        if (!controller.signal.aborted && requestEpoch === epoch) {
          failures.set(requestKey, failure);
          if (failures.size > 24) failures.delete(failures.keys().next().value!);
        }
        throw failure;
      }
    })();
    job = { controller, promise, users: 0 };
    pending.set(requestKey, job);
    const created = job;
    void promise.then(() => { if (pending.get(requestKey) === created) pending.delete(requestKey); }, () => { if (pending.get(requestKey) === created) pending.delete(requestKey); });
  }
  job.users++;
  const acquired = job;
  return { promise: job.promise, release() {
    acquired.users--;
    // React StrictMode re-subscribes synchronously; preserve that request.
    queueMicrotask(() => {
      if (!acquired.users && pending.get(requestKey) === acquired) { pending.delete(requestKey); acquired.controller.abort(); }
    });
  } };
}
