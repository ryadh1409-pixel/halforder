/**
 * HalfOrder app icon — App Store–safe generation pipeline.
 *
 * Source of truth (uploaded artwork): assets/images/app-icon-source.png
 * Optimized master (1024×1024, opaque, ≥10% safe padding):
 *   assets/images/app-icon-master-1024.png
 *
 * Usage: npm run generate:app-icon
 *
 * Does NOT redesign the icon — only centers, pads, and flattens for Apple HIG.
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

const SOURCE = join(assetsImages, 'app-icon-source.png');
const MASTER = join(assetsImages, 'app-icon-master-1024.png');

const SIZE = 1024;
/** Apple HIG: keep artwork inside ~80% of the canvas (≥10% margin each side). */
const SAFE = Math.round(SIZE * 0.8);
const BG = '#FFFFFF';
const PAD_DETECT = 4;

async function writePng(file, buffer) {
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, buffer);
}

/**
 * Build opaque 1024×1024 master:
 * - solid white background (no transparency)
 * - artwork centered, uniformly scaled (no stretch / no crop of logo)
 * - ≥10% safe padding
 * - no rounded corners, no added shadows/effects
 */
async function buildAppStoreMaster(sourcePath, outPath) {
  const { data, info } = await sharp(sourcePath)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const ch = info.channels;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const isBg = a < 8 || (r >= 250 && g >= 250 && b >= 250);
      if (!isBg) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX > maxX) {
    throw new Error('No artwork detected in app icon source');
  }

  minX = Math.max(0, minX - PAD_DETECT);
  minY = Math.max(0, minY - PAD_DETECT);
  maxX = Math.min(w - 1, maxX + PAD_DETECT);
  maxY = Math.min(h - 1, maxY + PAD_DETECT);

  const cw = maxX - minX + 1;
  const chh = maxY - minY + 1;
  const scale = Math.min(SAFE / cw, SAFE / chh);
  const tw = Math.round(cw * scale);
  const th = Math.round(chh * scale);
  const left = Math.round((SIZE - tw) / 2);
  const top = Math.round((SIZE - th) / 2);

  const glyph = await sharp(sourcePath)
    .rotate()
    .extract({ left: minX, top: minY, width: cw, height: chh })
    .resize(tw, th, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([{ input: glyph, left, top }])
    .flatten({ background: BG })
    .removeAlpha()
    .png({ compressionLevel: 9, force: true })
    .toFile(outPath);

  return { scale, tw, th, left, top };
}

async function resizeMaster(size) {
  return sharp(MASTER)
    .resize(size, size, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
    .flatten({ background: BG })
    .removeAlpha()
    .png({ compressionLevel: 9, force: true })
    .toBuffer();
}

/** Adaptive foreground: master inset on transparent canvas for Android safe zone. */
async function adaptiveForeground(size = 1024) {
  const inset = Math.round(size * 0.82);
  const glyph = await sharp(MASTER)
    .resize(inset, inset, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
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

/** White silhouette for Android monochrome / notification-style assets. */
async function monochromeMask(size = 1024) {
  const { data, info } = await sharp(MASTER)
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const isText = r < 240 || g < 240 || b < 240;
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
    out[o + 3] = isText ? 255 : 0;
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function verifyMaster() {
  const meta = await sharp(MASTER).metadata();
  if (meta.width !== 1024 || meta.height !== 1024) {
    throw new Error(`Master must be 1024×1024, got ${meta.width}×${meta.height}`);
  }
  if (meta.hasAlpha) {
    throw new Error('Master must be opaque (no alpha) for App Store Connect');
  }
  const { data, info } = await sharp(MASTER)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let minX = SIZE;
  let minY = SIZE;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * info.channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!(r >= 250 && g >= 250 && b >= 250)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const marginPct = (minX / SIZE) * 100;
  if (marginPct < 9.5) {
    throw new Error(`Safe margin too small: ${marginPct.toFixed(1)}% (need ≥10%)`);
  }
  return {
    width: meta.width,
    height: meta.height,
    hasAlpha: !!meta.hasAlpha,
    space: meta.space,
    marginPct: +marginPct.toFixed(1),
    contentBox: { w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}

async function main() {
  await fs.access(SOURCE);

  const built = await buildAppStoreMaster(SOURCE, MASTER);
  console.log(
    `Wrote App Store master ${MASTER} (scale=${built.scale.toFixed(3)}, pad≥10%)`,
  );

  const check = await verifyMaster();
  console.log('Master verification:', check);

  const masterBuf = await fs.readFile(MASTER);

  await writePng(join(assetsRoot, 'icon.png'), masterBuf);
  console.log('Wrote assets/icon.png');

  await writePng(join(assetsImages, 'icon.png'), masterBuf);
  console.log('Wrote assets/images/icon.png');

  await writePng(join(assetsImages, 'logo.png'), masterBuf);
  console.log('Wrote assets/images/logo.png (splash / AppLogo)');

  await writePng(join(assetsImages, 'splash-icon.png'), masterBuf);
  console.log('Wrote assets/images/splash-icon.png');

  await writePng(join(assetsImages, 'halforder-logo.png'), masterBuf);
  await sharp(MASTER).jpeg({ quality: 95 }).toFile(join(assetsImages, 'halforder-logo.jpg'));
  console.log('Synced halforder-logo.*');

  await writePng(join(assetsImages, 'favicon.png'), await resizeMaster(48));
  console.log('Wrote assets/images/favicon.png');

  const fg = await adaptiveForeground(1024);
  await writePng(join(assetsImages, 'app-icon-foreground.png'), fg);
  await writePng(join(assetsImages, 'android-icon-foreground.png'), fg);
  console.log('Wrote adaptive / android foreground');

  const bgTile = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: BG,
    },
  })
    .png({ force: true })
    .toBuffer();
  await writePng(join(assetsImages, 'android-icon-background.png'), bgTile);
  console.log('Wrote android-icon-background.png');

  await writePng(
    join(assetsImages, 'android-icon-monochrome.png'),
    await monochromeMask(1024),
  );
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
    await writePng(join(iosOut, name), await resizeMaster(px));
  }
  // App Store marketing / Contents-style alias
  await writePng(join(iosOut, 'AppIcon-1024.png'), masterBuf);
  console.log(`Wrote ${iosSizes.length + 1} files to assets/icons/ios/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
