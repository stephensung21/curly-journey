// Builds the app icons from lorikeet.svg: node assets/logo/icons.js assets/logo assets/images (run from apps/mobile).
const sharp = require('sharp');
const fs = require('fs');
const [dir, out] = process.argv.slice(2);
const svg = fs.readFileSync(dir + '/lorikeet.svg', 'utf8');
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const wrap = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${body}</svg>`);
const scaled = (k, bg) => wrap(`${bg ? '<rect width="1024" height="1024" fill="#f6f1e6"/>' : ''}<g transform="translate(512 512) scale(${k}) translate(-512 -512)">${inner}</g>`);
(async () => {
  await sharp(scaled(1.27, true)).resize(1024).flatten({ background: '#f6f1e6' }).png().toFile(out + '/icon.png');
  await sharp(scaled(0.95, false)).resize(512).png().toFile(out + '/android-icon-foreground.png');
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#f6f1e6' } }).png().toFile(out + '/android-icon-background.png');
  await sharp(scaled(1.0, false)).resize(1024).png().toFile(out + '/splash-icon.png');
  await sharp(scaled(1.27, true)).resize(48).png().toFile(out + '/favicon.png');
  // Monochrome: only the graphite lines, as alpha.
  const { data, info } = await sharp(scaled(0.95, false)).resize(432).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    const sat = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    const a = data[i + 3] * (lum < 75 && sat < 40 ? 1 : 0);
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = a;
  }
  await sharp(data, { raw: info }).png().toFile(out + '/android-icon-monochrome.png');
  console.log('ok');
})();
