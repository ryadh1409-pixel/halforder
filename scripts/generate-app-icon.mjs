/**
 * HalfOrder app icon — regenerate all store / splash / favicon assets
 * from the canonical branding image: assets/images/halforder-logo.png
 *
 * Usage: npm run generate:app-icon
 */
import fs from 'node:fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const assetsRoot = join(root, 'assets');
const assetsImages = join(assetsRoot, 'images');
const iosOut = join(assetsRoot, 'icons', 'ios');

/** Source of truth — uploaded HalfOrder branding (pizza / noodles). */
const SOURCE = join(assetsImages, 'halforder-logo.png');

/** Sampled from logo corner — adaptive / splash chrome. */
const BG = '#F88355';

async function squareFromSource(size, { transparent = false } = {}) {
  const base = sharp(SOURCE).rotate().resize(size, size, {
    fit: 'cover',
    position: 'centre',
  });
  if (transparent) {
    return base.ensureAlpha().png({ compressionLevel: 9 }).toBuffer();
  }
  return base
    .flatten({ background: BG })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function writePng(file, buffer) {
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, buffer);
}

/**
 * Adaptive foreground: logo inset ~82% on transparent canvas (safe zone).
 */
async function adaptiveForeground(size = 1024) {
  const inset = Math.round(size * 0.82);
  const glyph = await sharp(SOURCE)
    .rotate()
    .resize(inset, inset, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: glyph, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await fs.access(SOURCE);

  const full1024 = await squareFromSource(1024);

  await writePng(join(assetsRoot, 'icon.png'), full1024);
  console.log('Wrote assets/icon.png (1024 × 1024)');

  await writePng(join(assetsImages, 'icon.png'), full1024);
  console.log('Wrote assets/images/icon.png (1024 × 1024)');

  await writePng(join(assetsImages, 'logo.png'), full1024);
  console.log('Wrote assets/images/logo.png (splash / AppLogo)');

  await writePng(join(assetsImages, 'splash-icon.png'), full1024);
  console.log('Wrote assets/images/splash-icon.png');

  const favicon = await squareFromSource(48);
  await writePng(join(assetsImages, 'favicon.png'), favicon);
  console.log('Wrote assets/images/favicon.png (48 × 48)');

  const fg = await adaptiveForeground(1024);
  await writePng(join(assetsImages, 'app-icon-foreground.png'), fg);
  console.log('Wrote assets/images/app-icon-foreground.png (adaptive)');

  // Legacy Expo template android adaptive names (keep in sync if referenced later)
  await writePng(join(assetsImages, 'android-icon-foreground.png'), fg);
  const bgTile = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: BG,
    },
  })
    .png()
    .toBuffer();
  await writePng(join(assetsImages, 'android-icon-background.png'), bgTile);
  console.log('Wrote android-icon-foreground/background.png');

  // Simple white silhouette for notification / monochrome (full-bleed light mask)
  const mono = await sharp(SOURCE)
    .rotate()
    .resize(1024, 1024, { fit: 'cover', position: 'centre' })
    .greyscale()
    .threshold(200)
    .ensureAlpha()
    .png()
    .toBuffer();
  await writePng(join(assetsImages, 'android-icon-monochrome.png'), mono);
  console.log('Wrote android-icon-monochrome.png');

  await fs.mkdir(iosOut, { recursive: true });
  const iosSizes = [
    ['Icon-20@2x.png', 40],
    ['Icon-20@3x.png', 60],
    ['Icon-29@2x.png', 58],
    ['Icon-29@3x.png', 87],
    ['Icon-40@2x.png', 80],
    ['Icon-40@3x.png', 120],
    ['Icon-60@2x.png', 120],
    ['Icon-60@3x.png', 180],
    ['Icon-1024.png', 1024],
  ];
  for (const [name, px] of iosSizes) {
    await writePng(join(iosOut, name), await squareFromSource(px));
  }
  console.log(`Wrote ${iosSizes.length} files to assets/icons/ios/`);

  // Keep halforder-logo.jpg identical to the PNG master for any jpeg references
  await sharp(SOURCE)
    .jpeg({ quality: 95 })
    .toFile(join(assetsImages, 'halforder-logo.jpg'));
  console.log('Synced assets/images/halforder-logo.jpg');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
