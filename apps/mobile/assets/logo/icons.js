// Builds the app icons from lorikeet.svg (concept C, Scribble). From apps/mobile: node assets/logo/icons.js assets/logo assets/images
const sharp = require('sharp');
const [dir, out] = process.argv.slice(2);
const PAPER = '#f6f1e6';

/** The drawing, trimmed to its ink, fitted into a size x size square at the given fill. */
async function drawing(size, fill) {
  const ink = await sharp(dir + '/lorikeet.svg', { density: 600 }).trim().png().toBuffer();
  const box = Math.round(size * fill);
  const art = await sharp(ink).resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, gravity: 'centre' }])
    .png()
    .toBuffer();
}

(async () => {
  await sharp(await drawing(1024, 0.8)).flatten({ background: PAPER }).png().toFile(out + '/icon.png');
  // Adaptive icons show the middle two thirds of the canvas, so the bird sits well inside it.
  await sharp(await drawing(512, 0.58)).png().toFile(out + '/android-icon-foreground.png');
  await sharp({ create: { width: 512, height: 512, channels: 4, background: PAPER } }).png().toFile(out + '/android-icon-background.png');
  await sharp(await drawing(1024, 0.6)).png().toFile(out + '/splash-icon.png');
  await sharp(await drawing(48, 0.9)).flatten({ background: PAPER }).png().toFile(out + '/favicon.png');
  // Monochrome: only the graphite line, as alpha.
  const { data, info } = await sharp(await drawing(432, 0.58)).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    const sat = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    data[i + 3] = lum < 90 && sat < 40 ? data[i + 3] : 0;
    data[i] = data[i + 1] = data[i + 2] = 255;
  }
  await sharp(data, { raw: info }).png().toFile(out + '/android-icon-monochrome.png');
  console.log('ok');
})();
