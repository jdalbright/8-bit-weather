import sharp from 'sharp';
import { Buffer } from 'node:buffer';
import { mkdir } from 'node:fs/promises';

// Open, asymmetric streaks avoid the rings made by reflecting the same patch
// on both axes. Wrap marks across tile edges; keep the established 64x32 period
// so playback still advances downstream seamlessly at the loop boundary.
const width = 64, height = 32;
const streaks = [
  // x, y, length, thickness, palette index. No paired edges or closed outlines.
  [53, 0, 24, 2, 1], [20, 2, 19, 2, 3], [24, 2, 7, 1, 4],
  [3, 6, 29, 2, 0], [43, 7, 14, 1, 3],
  [29, 11, 26, 2, 1], [59, 12, 14, 2, 3], [63, 12, 6, 1, 4],
  [15, 17, 21, 2, 3], [21, 17, 9, 1, 4], [47, 18, 22, 2, 0],
  [0, 22, 22, 2, 1], [36, 24, 18, 1, 3],
  [9, 28, 29, 2, 1], [49, 30, 9, 1, 3],
];
await mkdir('public/art/raleigh-water', { recursive: true });
for (const light of ['day', 'overcast', 'night']) {
  const sample = await sharp(`public/art/scene-raleigh-${light}-v1.webp`)
    .extract({ left: 732, top: 773, width: 32, height: 16 })
    .removeAlpha().raw().toBuffer();
  // Average small luminance bands from the painting for restrained, consistent
  // day/overcast/night colors, without copying its reflected geometry.
  const colors = Array.from({ length: sample.length / 3 }, (_, i) => [...sample.subarray(i * 3, i * 3 + 3)])
    .sort((a, b) => a[0] + 2 * a[1] + a[2] - b[0] - 2 * b[1] - b[2]);
  const palette = [.22, .4, .54, .7, .84].map(quantile => {
    const center = Math.floor(quantile * colors.length);
    const band = colors.slice(center - 12, center + 12);
    return [0, 1, 2].map(c => Math.round(band.reduce((sum, color) => sum + color[c], 0) / band.length));
  });
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) pixels.set(palette[2], i * 3);
  for (const [left, top, length, thickness, color] of streaks) {
    for (let y = top; y < top + thickness; y++) for (let x = left; x < left + length; x++) {
      pixels.set(palette[color], ((y % height) * width + x % width) * 3);
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 3 } })
    .png().toFile(`public/art/raleigh-water/water-${light}.png`);
}

// Coverage follows the painted blue water, leaving neutral stone and green bank
// pixels fixed. Tiny enclosed white reflection gaps belong to the water surface.
const left = 392, top = 664, maskWidth = 568, maskHeight = 137;
const water = await sharp('public/art/scene-raleigh-day-v1.webp')
  .extract({ left, top, width: maskWidth, height: maskHeight }).removeAlpha().raw().toBuffer();
const coverage = new Uint8Array(maskWidth * maskHeight);
for (let i = 0; i < coverage.length; i++) {
  const [r, g, b] = water.subarray(i * 3, i * 3 + 3);
  coverage[i] = b - r > 38 && g > r * 1.15 && b > g * .87 ? 255 : 0;
}
const seen = new Uint8Array(coverage.length);
for (let start = 0; start < coverage.length; start++) {
  if (coverage[start] || seen[start]) continue;
  const region = [start]; seen[start] = 1;
  let edge = false;
  for (let cursor = 0; cursor < region.length; cursor++) {
    const i = region[cursor], x = i % maskWidth, y = Math.floor(i / maskWidth);
    if (!x || x === maskWidth - 1 || !y || y === maskHeight - 1) edge = true;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (x + dx < 0 || x + dx >= maskWidth || y + dy < 0 || y + dy >= maskHeight) continue;
      const next = (y + dy) * maskWidth + x + dx;
      if (!coverage[next] && !seen[next]) { seen[next] = 1; region.push(next); }
    }
  }
  // The foreground reflection occupies 59 pixels. Cover it with the current
  // too, so it blends like the smaller glints instead of staying bright white.
  if (!edge && region.length <= 64) for (const i of region) coverage[i] = 255;
}
await sharp(Buffer.from(coverage), { raw: { width: maskWidth, height: maskHeight, channels: 1 } })
  .png().toFile('public/art/raleigh-water/coverage.png');
