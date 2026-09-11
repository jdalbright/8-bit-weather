import sharp from 'sharp';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { log } from 'node:console';

// Keep the original painting's pixels. Only the hidden background repair uses
// Imagegen artwork; the foreground sprite is segmented deterministically.
const source = 'docs/design/raleigh-oaks-v1/sources';
const output = 'public/art/raleigh-oaks';
const W = 960, H = 801, width = 240, height = 320, top = 280, frames = 8;
await mkdir(output, { recursive: true });
const decode = file => sharp(file).resize(W, H, { fit: 'fill', kernel: 'nearest' }).removeAlpha().raw().toBuffer();
const original = {};
for (const light of ['day', 'overcast', 'night']) original[light] = await decode(`docs/design/raleigh-v1/scene-raleigh-${light}-v1.webp`);
const alpha = new Uint8Array(W * H);
for (let y = 290; y < 590; y++) for (let x = 0; x < W; x++) {
  // Keep the station-side pine and midground woods on the background plate.
  const edge = y < 445 ? 194 : y < 485 ? 170 : 155;
  if (x >= edge && x < W - edge) continue;
  const p = (y * W + x) * 3;
  const [r, g, b] = original.day.subarray(p, p + 3);
  const sky = r > 145 && r > g * 1.07 && g > b * 1.12;
  if (!sky) alpha[y * W + x] = 255;
}
// Repair the silhouette plus its two-pixel movement envelope, leaving the
// surrounding original plate intact. The sprite covers the neutral silhouette.
const repair = new Uint8Array(W * H);
for (let y = top; y < 590; y++) for (let x = 0; x < W; x++) {
  if (!alpha[y * W + x]) continue;
  const radius = y < 480 ? 2 : 0;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (x + dx >= 0 && x + dx < W) repair[(y + dy) * W + x + dx] = 255;
  }
}

for (const light of ['day', 'overcast', 'night']) {
  const clean = await decode(`${source}/clean-${light}.png`);
  const background = Buffer.from(original[light]);
  for (let i = 0; i < W * H; i++) {
    if (repair[i]) clean.copy(background, i * 3, i * 3, i * 3 + 3);
  }
  await sharp(background, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 86, effort: 6 }).toFile(`public/art/scene-raleigh-${light}-v1.webp`);
  // Eight transparent pixels on either side prevent neighboring-frame bleed at fractional scene scales.
  for (const [side, left] of [['left', -8], ['right', 728]]) {
    const base = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (left + x < 0 || left + x >= W) continue;
      const sourcePixel = (top + y) * W + left + x, p = (y * width + x) * 4;
      if (!alpha[sourcePixel]) continue;
      base.set(original[light].subarray(sourcePixel * 3, sourcePixel * 3 + 3), p);
      base[p + 3] = 255;
    }
    // Leaf masses make occasional one-source-pixel rustles. Trunk,
    // branches, roots and neutral frame retain the original painting exactly.
    const centers = side === 'left'
      ? [[36, 35], [95, 42], [145, 85], [42, 115], [128, 151], [48, 215]]
      : [[196, 52], [147, 80], [103, 121], [187, 145], [153, 206]];
    const groups = new Int8Array(width * height).fill(-1);
    for (let y = 0; y < 240; y++) for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (!base[p + 3]) continue;
      const q = ((top + y) * W + left + x) * 3;
      const [r, g, b] = original.day.subarray(q, q + 3);
      if (g < r * 1.12 || g < b * 1.13) continue;
      let nearest = 0, distance = Infinity;
      centers.forEach(([cx, cy], group) => {
        const candidate = (x - cx) ** 2 + (y - cy) ** 2;
        if (candidate < distance) { nearest = group; distance = candidate; }
      });
      groups[y * width + x] = nearest;
    }
    const beats = [[0, 0, 1, 0, 0, 0, 0, 0], [0, 0, 0, 1, 0, 0, 0, 0]];
    const sheet = Buffer.alloc(width * frames * height * 4);
    for (let frame = 0; frame < frames; frame++) {
      const pose = Buffer.from(base);
      const offsets = centers.map(([, cy], group) => [
        cy > 190 ? 0 : beats[group % 2][frame],
        0,
      ]);
      // A shaded under-canopy closes the seams between moving leaf clusters.
      for (let i = 0; i < groups.length; i++) {
        if (groups[i] < 0 || offsets[groups[i]].every(v => v === 0)) continue;
        for (let c = 0; c < 3; c++) pose[i * 4 + c] = Math.round(base[i * 4 + c] * .96);
      }
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const group = groups[y * width + x];
        if (group < 0) continue;
        const [dx, dy] = offsets[group], tx = x + dx, ty = y + dy;
        if (tx < 4 || tx >= width - 4 || ty < 0 || ty >= height) continue;
        const p = (y * width + x) * 4;
        base.copy(pose, (ty * width + tx) * 4, p, p + 4);
      }
      for (let y = 0; y < height; y++) {
        pose.copy(sheet, (y * width * frames + frame * width) * 4, y * width * 4, (y + 1) * width * 4);
      }
    }
    // PNG masters are genuinely transparent standalone sprites; runtime uses compact WebP strips.
    await sharp(base, { raw: { width, height, channels: 4 } }).png().toFile(`${source}/oak-${side}-${light}.png`);
    await sharp(sheet, { raw: { width: width * frames, height, channels: 4 } }).webp({ quality: 80, alphaQuality: 100, effort: 6 }).toFile(`${output}/oak-${side}-${light}.webp`);
  }
}
await writeFile(`${output}/atlas.json`, JSON.stringify({ width, height, frames, top, left: -8, right: 728, lights: ['day', 'overcast', 'night'] }, null, 2) + '\n');
log('Built six transparent oak strips, six PNG masters, and three repaired scene plates.');
