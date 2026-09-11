import { fetchRadarResource } from './radar';

/** Only compressed images are retained; the renderer owns the single decoded frame. */
export class RadarImageCache {
  private blobs = new Map<string, Blob>();
  private bytes = 0;
  constructor(private maxBytes = 8 * 1024 * 1024, private maxFrames = 25) {}
  async get(url: string, signal: AbortSignal): Promise<Blob> {
    const cached = this.blobs.get(url);
    if (cached) { this.blobs.delete(url); this.blobs.set(url, cached); return cached; }
    const response = await fetchRadarResource(url, signal);
    if (!response.headers.get('Content-Type')?.startsWith('image/png')) throw new Error('The radar service returned no imagery. Try again shortly.');
    const blob = await response.blob();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (blob.size > this.maxBytes) throw new Error('Radar imagery is too large to load. Zoom in and try again.');
    if (!this.blobs.has(url)) { this.blobs.set(url, blob); this.bytes += blob.size; }
    while (this.bytes > this.maxBytes || this.blobs.size > this.maxFrames) {
      const first = this.blobs.keys().next().value!;
      this.bytes -= this.blobs.get(first)!.size; this.blobs.delete(first);
    }
    return blob;
  }
  clear() { this.blobs.clear(); this.bytes = 0; }
}

export async function decodeRadarImage(blob: Blob, signal: AbortSignal): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob), image = new Image();
  const abort = () => { image.src = ''; };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    image.src = url;
    await image.decode();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return image;
  } finally { signal.removeEventListener('abort', abort); URL.revokeObjectURL(url); }
}
