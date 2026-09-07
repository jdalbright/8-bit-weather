import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { asheville, forecastFixture } from '../src/test/fixtures';

test('a new service worker prompts for an update and retains saved choices', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Production update lifecycle is checked in Chromium.');
  let revision = 1;
  const root = resolve('dist');
  const types: Record<string,string> = { '.js':'application/javascript', '.css':'text/css', '.html':'text/html', '.json':'application/json', '.webmanifest':'application/manifest+json', '.woff2':'font/woff2', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml' };
  // An isolated test server changes only a worker comment, never the build or app files.
  const server = createServer(async (request,response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(`${root}/`)) { response.writeHead(403); response.end(); return; }
    try {
      let bytes = await readFile(file);
      if (path === '/sw.js') bytes = Buffer.concat([bytes, Buffer.from(`\n// isolated QA revision ${revision}\n`)]);
      response.writeHead(200, {'content-type':types[extname(file)] ?? 'application/octet-stream','cache-control':'no-store'}); response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start');
  try {
    await page.addInitScript(place => { if (!localStorage.getItem('8bit-weather:v1')) localStorage.setItem('8bit-weather:v1', JSON.stringify({preferences:{units:'imperial'},places:[place],selected:place})); },asheville);
    await page.route('https://api.open-meteo.com/**', route => route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(forecastFixture(Date.now()))}));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await expect(page.getByRole('heading',{name:'72° Fahrenheit'})).toBeVisible();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'°C / km/h',exact:true}).click();
    await page.getByRole('button',{name:'Today',exact:true}).click();
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload(); await expect(page.getByRole('heading',{name:'22° Celsius'})).toBeVisible();
    revision++;
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration?.update(); });
    await expect(page.getByText('A fresh version is ready.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Update app',exact:true}).click();
    await expect(page.getByRole('heading',{name:'22° Celsius'})).toBeVisible();
    await expect(page.getByText('A fresh version is ready.',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Change location, Asheville'})).toBeVisible();
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
