import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import console from 'node:console';

const root = path.resolve(import.meta.dirname, '..');
const assets = path.join(root, 'ios/WeatherWidget/Assets.xcassets');
await mkdir(assets, { recursive: true });
await writeFile(path.join(assets, 'Contents.json'), JSON.stringify({ info: { version: 1, author: 'xcode' } }, null, 2) + '\n');
for (const landscape of ['meadow', 'raleigh', 'beach', 'coastal-plain', 'piedmont', 'blue-ridge']) {
  for (const light of ['day', 'overcast', 'night']) {
    const prefix = landscape === 'meadow' ? 'scene' : `scene-${landscape}`;
    const version = landscape === 'meadow' ? 2 : 1;
    const name = `${landscape}-${light}`;
    const directory = path.join(assets, `${name}.imageset`);
    await mkdir(directory, { recursive: true });
    // PNG is supported by asset catalogs; nearest-neighbor preserves authored pixels.
    await sharp(path.join(root, `public/art/${prefix}-${light}-v${version}.webp`))
      .resize({ width: 720, kernel: 'nearest' }).png({ compressionLevel: 9 })
      .toFile(path.join(directory, `${name}.png`));
    await writeFile(path.join(directory, 'Contents.json'), JSON.stringify({
      images: [{ filename: `${name}.png`, idiom: 'universal' }],
      info: { version: 1, author: 'xcode' },
    }, null, 2) + '\n');
  }
}
console.log('Built 18 widget scenes from shared web artwork.');
