import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Synthetic radar pixels and empty basemap tiles: never presented as live evidence. */
export async function mockRadar(page: Page, now: number) {
  // WebKit worker fetches bypass Playwright's page routing. Serve real, local empty
  // protobuf tiles so the worker never falls through to a fictitious provider URL.
  const tileServer = createServer((_request, response) => { response.writeHead(200, { 'Content-Type': 'application/x-protobuf', 'Access-Control-Allow-Origin': '*' }); response.end(); });
  await new Promise<void>(resolve => tileServer.listen(0, '127.0.0.1', resolve));
  page.on('close', () => tileServer.close());
  const tileUrl = `http://127.0.0.1:${(tileServer.address() as AddressInfo).port}/{z}/{x}/{y}.pbf`;
  const times = Array.from({ length: 60 }, (_, i) => new Date(now - (59 - i) * 120_000).toISOString());
  const image = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="64" height="64"><path d="M12 14h15v8h12v18H24v9H9V30h3z" fill="#20ad45"/><path d="M22 24h10v12H22z" fill="#f4d34b"/></svg>') }]).png().toBuffer();
  const control = { metadataError: false, imageError: false, delayed: false, imageDelay: 0, requests: [] as string[] };
  await page.route('https://tiles.openfreemap.org/**', route => route.request().url().endsWith('/planet')
    ? route.fulfill({ json: { tilejson: '3.0.0', tiles: [tileUrl], minzoom: 0, maxzoom: 14 }, headers: { 'access-control-allow-origin': '*' } })
    : route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf', headers: { 'access-control-allow-origin': '*' } }));
  await page.route('https://opengeo.ncep.noaa.gov/**', async route => {
    const url = new URL(route.request().url()); control.requests.push(url.href);
    if (url.searchParams.get('request') === 'GetCapabilities') {
      if (control.metadataError) return route.fulfill({ status: 503, body: 'unavailable' });
      const product = url.pathname.split('/').at(-2);
      const frames = control.delayed ? times.map(t => new Date(Date.parse(t) - 1800000).toISOString()) : times;
      return route.fulfill({ contentType: 'text/xml', headers: { 'access-control-allow-origin': '*' }, body: `<WMS_Capabilities xmlns="http://www.opengis.net/wms"><Capability><Layer><Layer><Name>${product}</Name><Dimension name="time">${frames.join(',')}</Dimension></Layer></Layer></Capability></WMS_Capabilities>` });
    }
    if (control.imageDelay) await new Promise(resolve => setTimeout(resolve, control.imageDelay));
    if (control.imageError) return route.fulfill({ status: 503, body: 'unavailable' });
    return route.fulfill({ contentType: 'image/png', body: image, headers: { 'access-control-allow-origin': '*' } });
  });
  return control;
}
