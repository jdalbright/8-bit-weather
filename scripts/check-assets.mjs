import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { log } from 'node:console';
// Counting the whole output is a stricter ceiling than counting only precached files.
async function bytes(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const sizes = await Promise.all(entries.map(entry => entry.isDirectory() ? bytes(join(directory, entry.name)) : stat(join(directory, entry.name)).then(info => info.size)));
  return sizes.reduce((total, size) => total + size, 0);
}
const total = await bytes('dist');
if (total >= 1_500_000) throw new Error(`Offline asset budget exceeded: ${total} bytes`);
log(`All production assets: ${(total / 1024).toFixed(1)} KiB (budget: 1.5 MB)`);
