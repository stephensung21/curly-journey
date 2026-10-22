// Generates the paper-grain background tiles (visual spec §2.4 and §2.1a).
// Run once: node scripts/make-grain.mjs
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const SIZE = 180;

function tile(rgb, maxAlpha, seed) {
  const png = new PNG({ width: SIZE, height: SIZE });
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const o = i * 4;
    png.data[o] = rgb[0];
    png.data[o + 1] = rgb[1];
    png.data[o + 2] = rgb[2];
    // Squared noise: mostly faint specks with occasional darker grains.
    png.data[o + 3] = Math.round(rand() ** 2 * maxAlpha * 255 * 2);
  }
  return PNG.sync.write(png);
}

writeFileSync(new URL('../assets/grain-dark.png', import.meta.url), tile([255, 255, 255], 0.1, 7));
writeFileSync(new URL('../assets/grain-light.png', import.meta.url), tile([64, 46, 26], 0.12, 11));
