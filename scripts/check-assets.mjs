import { readdir, stat, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { log } from 'node:console';
async function assets(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? assets(join(directory, entry.name)) : stat(join(directory, entry.name)).then(info => ({ path: join(directory, entry.name), bytes: info.size }))))).flat();
}
const files = await assets('dist');
const optional = file => /^radar-(map|vendor|worker)-/.test(basename(file.path));
const sum = items => items.reduce((total, file) => total + file.bytes, 0);
const core = sum(files.filter(file => !optional(file))), radar = sum(files.filter(optional));
if (!files.some(file => /^radar-worker-/.test(basename(file.path)) && file.bytes > 10_000)) throw new Error('Radar worker is missing or was tree-shaken to an empty entry.');
if (core >= 3_000_000) throw new Error(`Core/offline asset budget exceeded: ${core} bytes`);
if (radar >= 2_000_000) throw new Error(`Optional radar asset budget exceeded: ${radar} bytes`);
const sw = await readFile('dist/sw.js', 'utf8');
if (/url:["'][^"']*radar-(?:map|vendor|worker)-/.test(sw)) throw new Error('Optional radar engine must not be precached.');
const html = await readFile('dist/index.html', 'utf8');
if (/<(?:script|link)[^>]*(?:src|href)=["'][^"']*radar-(?:map|vendor|worker)-/.test(html)) throw new Error('Radar must not load with the initial document.');
log(`Core/offline: ${(core / 1024).toFixed(1)} KiB / 3 MB; optional radar: ${(radar / 1024).toFixed(1)} KiB / 2 MB.`);
