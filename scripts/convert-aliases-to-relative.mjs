/**
 * Replace @/ and @services/ imports with relative paths.
 * Run: node scripts/convert-aliases-to-relative.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'dist-legal',
  'coverage',
  'functions',
]);

/** Skip only by directory name (do not use name `admin` — would skip `app/admin`). */
function shouldSkipDir(name) {
  return SKIP_DIR_NAMES.has(name);
}

function shouldSkipTreeRel(relPosix) {
  return (
    relPosix === 'admin-dashboard' ||
    relPosix.startsWith('admin-dashboard/')
  );
}

function specifierToRootRel(spec) {
  if (spec.startsWith('@/')) return spec.slice(2);
  if (spec.startsWith('@services/')) return `services/${spec.slice('@services/'.length)}`;
  return null;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function relativeImport(fromFile, spec) {
  const rootRel = specifierToRootRel(spec);
  if (!rootRel) return null;
  const absTarget = path.join(ROOT, rootRel);
  const fromDir = path.dirname(fromFile);
  let rel = path.relative(fromDir, absTarget);
  rel = toPosix(rel);
  if (rel === '') return './';
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function* walkFiles(dir) {
  const rel = toPosix(path.relative(ROOT, dir));
  if (rel && shouldSkipTreeRel(rel)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (shouldSkipDir(ent.name)) continue;
      const subRel = toPosix(path.relative(ROOT, full));
      if (shouldSkipTreeRel(subRel)) continue;
      yield* walkFiles(full);
    } else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) {
      yield full;
    }
  }
}

/** Specifiers that are path aliases (not npm scopes like @react-navigation). */
function isAliasSpecifier(spec) {
  return spec.startsWith('@/') || spec.startsWith('@services/');
}

function transformSource(filePath, src) {
  let out = src;

  const subFrom = (full, quote, spec) => {
    if (!isAliasSpecifier(spec)) return full;
    const rel = relativeImport(filePath, spec);
    return rel != null ? `from ${quote}${rel}${quote}` : full;
  };

  // `from '@/x'` / `from "@services/x"`
  out = out.replace(/\bfrom\s+(['"])([^'"]+)\1/g, subFrom);

  // `import('@/x')`
  out = out.replace(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g, (full, quote, spec) => {
    if (!isAliasSpecifier(spec)) return full;
    const rel = relativeImport(filePath, spec);
    return rel != null ? `import(${quote}${rel}${quote})` : full;
  });

  // `require('@/x')`
  out = out.replace(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g, (full, quote, spec) => {
    if (!isAliasSpecifier(spec)) return full;
    const rel = relativeImport(filePath, spec);
    return rel != null ? `require(${quote}${rel}${quote})` : full;
  });

  return out;
}

let filesChanged = 0;
for (const file of walkFiles(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('@/') && !src.includes('@services/')) continue;
  const out = transformSource(file, src);
  if (out !== src) {
    fs.writeFileSync(file, out, 'utf8');
    filesChanged += 1;
    console.log('updated', path.relative(ROOT, file));
  }
}

console.log(`Done. Modified ${filesChanged} files.`);
