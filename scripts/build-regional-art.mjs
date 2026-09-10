import sharp from 'sharp';
import { stat } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const root = new URL('../', import.meta.url);
let total = 0;
for (const landscape of ['beach', 'coastal-plain', 'piedmont', 'blue-ridge']) {
  for (const light of ['day', 'overcast', 'night']) {
    const name = `scene-${landscape}-${light}-v1`;
    const input = fileURLToPath(new URL(`docs/design/nc-regions-v1/sources/${name}.png`, root));
    const output = fileURLToPath(new URL(`public/art/${name}.webp`, root));
    await sharp(input).flatten({ background: '#24264e' }).resize(960, 801, { fit: 'fill', kernel: 'nearest' })
      .webp({ quality: 86, effort: 6 }).toFile(output);
    const size = (await stat(output)).size;
    total += size;
    process.stdout.write(`${name}: ${(size / 1024).toFixed(1)} KiB\n`);
  }
}
process.stdout.write(`Regional artwork: ${(total / 1024).toFixed(1)} KiB\n`);
