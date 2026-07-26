/**
 * HalfOrder app icon — App Store–safe generation pipeline.
 *
 * Source: assets/icon.png (Expo entry) or assets/images/app-icon-source.png
 * Master: assets/images/app-icon-master-1024.png
 *
 * Usage: npm run generate:app-icon
 *
 * Removes baked-in white frames / pre-rounded cards so iOS can apply its native mask.
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

const SOURCE = join(assetsRoot, 'icon.png');
const SOURCE_FALLBACK = join(assetsImages, 'app-icon-source.png');
const MASTER = join(assetsImages, 'app-icon-master-1024.png');
const WORKING = join(assetsImages, 'app-icon-working-source.png');

const SIZE = 1024;

async function writePng(file, buffer) {
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, buffer);
}

async function contentBBox(sourcePath) {
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
  let darkMinX = w;
  let darkMinY = h;
  let darkMaxX = 0;
  let darkMaxY = 0;
  let darkCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      const isBg = a < 8 || (r >= 248 && g >= 248 && b >= 248);
      const isDark = a > 200 && r < 40 && g < 40 && b < 55;
      if (!isBg) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      if (isDark) {
        darkCount += 1;
        if (x < darkMinX) darkMinX = x;
        if (y < darkMinY) darkMinY = y;
        if (x > darkMaxX) darkMaxX = x;
        if (y > darkMaxY) darkMaxY = y;
      }
    }
  }
  if (minX > maxX) throw new Error('No artwork detected in app icon source');

  const darkArea =
    darkCount > 0 ? (darkMaxX - darkMinX + 1) * (darkMaxY - darkMinY + 1) : 0;
  const useDark = darkCount > w * h * 0.15 && darkArea > w * h * 0.35;
  if (useDark) {
    return {
      left: darkMinX,
      top: darkMinY,
      width: darkMaxX - darkMinX + 1,
      height: darkMaxY - darkMinY + 1,
      mode: 'dark',
    };
  }
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    mode: 'light',
  };
}

/** Flood-fill near-white pixels connected to the canvas edge → brand fill. */
function wipeEdgeFrame(raw, width, height, channels, fill) {
  const out = Buffer.from(raw);
  const visited = new Uint8Array(width * height);
  const queue = [];
  const isWipe = (x, y) => {
    const i = (y * width + x) * channels;
    return out[i] >= 200 && out[i + 1] >= 200 && out[i + 2] >= 200;
  };
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    if (!isWipe(x, y)) return;
    visited[idx] = 1;
    queue.push(idx);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (queue.length) {
    const idx = queue.pop();
    const x = idx % width;
    const y = (idx / width) | 0;
    const i = idx * channels;
    out[i] = fill.r;
    out[i + 1] = fill.g;
    out[i + 2] = fill.b;
    if (channels > 3) out[i + 3] = 255;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return out;
}

async function buildAppStoreMaster(sourcePath, outPath) {
  const box = await contentBBox(sourcePath);
  const inset =
    box.mode === 'dark'
      ? Math.max(8, Math.round(Math.min(box.width, box.height) * 0.02))
      : Math.max(2, Math.round(Math.min(box.width, box.height) * 0.01));
  const insetBox = {
    left: box.left + inset,
    top: box.top + inset,
    width: Math.max(8, box.width - inset * 2),
    height: Math.max(8, box.height - inset * 2),
  };
  const side = Math.max(insetBox.width, insetBox.height);
  const meta = await sharp(sourcePath).metadata();
  const imgW = meta.width ?? insetBox.width;
  const imgH = meta.height ?? insetBox.height;
  let cropLeft = Math.round(insetBox.left - (side - insetBox.width) / 2);
  let cropTop = Math.round(insetBox.top - (side - insetBox.height) / 2);
  cropLeft = Math.max(0, Math.min(cropLeft, imgW - side));
  cropTop = Math.max(0, Math.min(cropTop, imgH - side));
  const cropSize = Math.min(side, imgW - cropLeft, imgH - cropTop);

  const fill =
    box.mode === 'dark'
      ? { r: 0, g: 0, b: 0 }
      : { r: 255, g: 255, b: 255 };

  const rawGlyph = await sharp(sourcePath)
    .rotate()
    .extract({
      left: cropLeft,
      top: cropTop,
      width: cropSize,
      height: cropSize,
    })
    .resize(SIZE, SIZE, {
      fit: 'cover',
      position: 'centre',
      kernel: sharp.kernel.lanczos3,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const wiped = wipeEdgeFrame(
    rawGlyph.data,
    SIZE,
    SIZE,
    rawGlyph.info.channels,
    fill,
  );

  await sharp(wiped, {
    raw: { width: SIZE, height: SIZE, channels: rawGlyph.info.channels },
  })
    .flatten({ background: fill })
    .removeAlpha()
    .png({ compressionLevel: 9, force: true })
    .toFile(outPath);

  return { cropSize, mode: box.mode, bg: fill };
}

async function resizeMaster(size) {
  return sharp(MASTER)
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .removeAlpha()
    .png({ compressionLevel: 9, force: true })
    .toBuffer();
}

async function adaptiveForeground(size = 1024) {
  const inset = Math.round(size * 0.92);
  const glyph = await sharp(MASTER)
    .resize(inset, inset, {
      fit: 'cover',
      position: 'centre',
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
    const isMark = !(r < 40 && g < 40 && b < 55);
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
    out[o + 3] = isMark ? 255 : 0;
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
  const corner = (x, y) => {
    const i = (y * SIZE + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [corner(0, 0), corner(SIZE - 1, 0), corner(0, SIZE - 1), corner(SIZE - 1, SIZE - 1)];
  const whiteCorners = corners.filter(
    ([r, g, b]) => r >= 240 && g >= 240 && b >= 240,
  ).length;
  if (whiteCorners >= 3) {
    throw new Error('Icon still has a white outer frame at the corners');
  }
  return {
    width: meta.width,
    height: meta.height,
    hasAlpha: !!meta.hasAlpha,
    corners,
  };
}

async function main() {
  let sourcePath = SOURCE;
  try {
    await fs.access(sourcePath);
  } catch {
    sourcePath = SOURCE_FALLBACK;
    await fs.access(sourcePath);
  }

  // Prefer last good working source when regenerating iteratively.
  try {
    await fs.access(WORKING);
    sourcePath = WORKING;
  } catch {
    /* first run */
  }

  const sourceBuf = await fs.readFile(sourcePath);
  await writePng(WORKING, sourceBuf);

  const built = await buildAppStoreMaster(WORKING, MASTER);
  console.log(
    `Wrote App Store master ${MASTER} (mode=${built.mode}, bg=${JSON.stringify(built.bg)})`,
  );

  const check = await verifyMaster();
  console.log('Master verification:', check);

  const masterBuf = await fs.readFile(MASTER);
  await writePng(join(assetsRoot, 'icon.png'), masterBuf);
  await writePng(join(assetsImages, 'icon.png'), masterBuf);
  await writePng(join(assetsImages, 'favicon.png'), await resizeMaster(48));

  const fg = await adaptiveForeground(1024);
  await writePng(join(assetsImages, 'app-icon-foreground.png'), fg);
  await writePng(join(assetsImages, 'android-icon-foreground.png'), fg);

  await writePng(
    join(assetsImages, 'android-icon-background.png'),
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: built.bg,
      },
    })
      .png({ force: true })
      .toBuffer(),
  );

  await writePng(
    join(assetsImages, 'android-icon-monochrome.png'),
    await monochromeMask(1024),
  );

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
  await writePng(join(iosOut, 'AppIcon-1024.png'), masterBuf);
  console.log(`Wrote ${iosSizes.length + 1} files to assets/icons/ios/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
