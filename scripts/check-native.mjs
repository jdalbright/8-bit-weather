import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import console from 'node:console';

const root = path.resolve('dist-native');
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    result.push(...(entry.isDirectory() ? await files(name) : [name]));
  }
  return result;
}
const output = await files(root);
assert(output.some(file => file.endsWith('/index.html')), 'Build the native bundle first.');
assert(!output.some(file => /(?:\/sw\.js|\/workbox-[^/]+|\.webmanifest)$/.test(file)), 'Native bundle must not ship a service worker or PWA manifest.');
const html = await readFile(path.join(root, 'index.html'), 'utf8');
assert(!/rel=["']manifest["']|registerSW\.js/.test(html), 'Native HTML must not register a PWA.');
for (const file of output.filter(file => file.endsWith('.js'))) {
  const content = await readFile(file, 'utf8');
  assert(!/serviceWorker\.register\(/.test(content), `Service worker registration found in ${file}`);
  assert(!/data\.api\.xweather\.com|client_secret/.test(content), 'Xweather credentials and upstream requests must stay on the server.');
  assert(!/sk-proj-[A-Za-z0-9_-]{20,}/.test(content), 'A server-side API key must never enter the app bundle.');
}
const sourceArt = (await readdir('public/art')).filter(file => file.endsWith('.webp'));
for (const file of sourceArt) assert((await stat(path.join(root, 'art', file))).size > 0, `Missing bundled art: ${file}`);
const config = await readFile('capacitor.config.ts', 'utf8');
assert(config.includes("webDir: 'dist-native'"), 'Native release must use its separate bundle.');
assert(!/server\s*:\s*\{[\s\S]*?url\s*:/.test(config), 'Release app must load bundled content for offline launch.');
console.log(`Native bundle checks passed: ${sourceArt.length} shared artwork assets, bundled shell, no PWA registration or embedded server key.`);
