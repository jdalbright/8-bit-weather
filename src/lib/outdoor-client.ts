import { briefingEndpoint } from './briefing-client';
import { validOutdoorRecommendation, type OutdoorRecommendation, type OutdoorRequest } from './outdoor-ai';

let limitedUntil = 0;

export class OutdoorError extends Error {
  constructor(message: string, public retryAt = 0) { super(message); }
}

/** Outdoor recommendations use OpenAI exclusively, independent of the briefing
 * provider preference. Failure stays an error; never fall back to an on-device model. */
export async function generateOutdoorRecommendation(request: OutdoorRequest, signal: AbortSignal): Promise<OutdoorRecommendation> {
  if (Date.now() < limitedUntil) throw new OutdoorError('AI recommendations are busy. Try again in a moment.', limitedUntil);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timer = window.setTimeout(abort, 15000);
  try {
    const response = await fetch(briefingEndpoint(), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    if (response.status === 429) {
      const retry = response.headers.get('retry-after');
      const seconds = Number(retry);
      const retryAt = retry && Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : Date.parse(retry ?? '');
      limitedUntil = Number.isFinite(retryAt) && retryAt > Date.now() ? retryAt : Date.now() + 60000;
      throw new OutdoorError('AI recommendations are busy. Try again in a moment.', limitedUntil);
    }
    if (!response.ok) throw new Error('unavailable');
    const result: unknown = await response.json();
    if (!validOutdoorRecommendation(result, request, Date.now())) throw new Error('invalid_recommendation');
    return result;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error instanceof OutdoorError) throw error;
    throw new OutdoorError('AI couldn’t generate a recommendation. Please try again.', Date.now() + 5000);
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
