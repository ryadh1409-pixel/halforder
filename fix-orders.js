#!/usr/bin/env node
/**
 * Repair corrupted driver orders in halforfer Firestore.
 *
 * Run from repo root (uses ./node_modules/firebase-admin):
 *   cd ~/ourfood-clean
 *   npm install
 *   DRY_RUN=1 node fix-orders.js
 *   node fix-orders.js
 *
 * Credentials (first match wins):
 *   1. GOOGLE_APPLICATION_CREDENTIALS env → cert()
 *   2. Service-account JSON under this repo → cert()
 *   3. ~/.config/gcloud/application_default_credentials.json → applicationDefault()
 *   4. applicationDefault() (gcloud / GCP metadata)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = __dirname;
const PROJECT_ID = 'halforfer';
const DRIVER_ID = '9XN334yG4hOglrOYfsehHPDM5zP2';

const EXPLICIT_ORDER_IDS = [
  'dik3oWxEoB4j9eYfz17F',
  'YEN47jLU0rv93ZKKoDHM',
  'GIe6SQEsEUcjxCRw7fYr',
  'IhEEVIZTYptoStT5CWBI',
];

const TERMINAL_PATCH = {
  status: 'completed',
  deliveryStatus: 'delivered',
  earningsRecorded: true,
  marketplaceArchived: true,
  updatedBy: 'manual_fix_script',
};

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

const adminPath = path.join(REPO_ROOT, 'node_modules', 'firebase-admin');
if (!fs.existsSync(adminPath)) {
  console.error(
    '[fix-orders] firebase-admin not found at',
    adminPath,
    '\nRun: cd ~/ourfood-clean && npm install',
  );
  process.exit(1);
}

/** @type {typeof import('firebase-admin')} */
const { initializeApp, getApps, applicationDefault, cert } = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

function findServiceAccountFiles(rootDir) {
  const skipNames = new Set([
    'firebase.json',
    'app.json',
    'package.json',
    'package-lock.json',
    'firestore.indexes.json',
    'tsconfig.json',
  ]);
  const matches = [];

  function walk(dir, depth) {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') && entry.name !== '.') continue;
        walk(full, depth + 1);
        continue;
      }
      if (!entry.name.endsWith('.json')) continue;
      if (skipNames.has(entry.name)) continue;
      const lower = entry.name.toLowerCase();
      if (!lower.includes('serviceaccount') && !lower.includes('firebase-adminsdk')) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (parsed.type === 'service_account' && parsed.private_key && parsed.client_email) {
          matches.push(full);
        }
      } catch {
        // not a service account json
      }
    }
  }

  walk(rootDir, 0);
  return matches.sort();
}

function loadServiceAccountJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Resolve credentials before connecting. Prints the chosen path/method.
 * @returns {{ mode: 'cert' | 'applicationDefault', path: string, certJson?: object }}
 */
function resolveCredentials() {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (envPath) {
    const resolved = path.resolve(envPath);
    if (fs.existsSync(resolved)) {
      return {
        mode: 'cert',
        path: resolved,
        certJson: loadServiceAccountJson(resolved),
      };
    }
    console.warn('[fix-orders] GOOGLE_APPLICATION_CREDENTIALS set but file missing:', resolved);
  }

  const discovered = findServiceAccountFiles(REPO_ROOT);
  if (discovered.length > 0) {
    const filePath = discovered[0];
    return {
      mode: 'cert',
      path: filePath,
      certJson: loadServiceAccountJson(filePath),
    };
  }

  const gcloudAdc = path.join(
    process.env.HOME || '',
    '.config/gcloud/application_default_credentials.json',
  );
  if (fs.existsSync(gcloudAdc)) {
    return { mode: 'applicationDefault', path: gcloudAdc };
  }

  return {
    mode: 'applicationDefault',
    path: '(applicationDefault — run: gcloud auth application-default login)',
  };
}

function initFirebase() {
  if (getApps().length > 0) return getFirestore();

  const creds = resolveCredentials();

  console.log('[fix-orders] credential mode:', creds.mode);
  console.log('[fix-orders] credential path:', creds.path);
  console.log('[fix-orders] projectId:', PROJECT_ID);
  console.log('[fix-orders] repo root:', REPO_ROOT);
  console.log('[fix-orders] firebase-admin:', adminPath);

  if (creds.mode === 'cert') {
    initializeApp({
      credential: cert(creds.certJson),
      projectId: PROJECT_ID,
    });
  } else {
    initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    });
  }

  console.log('[fix-orders] Firebase Admin initialized');
  return getFirestore();
}

function norm(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function snapshotFields(data) {
  return {
    status: data.status ?? null,
    deliveryStatus: data.deliveryStatus ?? null,
    earningsRecorded: data.earningsRecorded ?? null,
    marketplaceArchived: data.marketplaceArchived ?? null,
    assignedDriverId: data.assignedDriverId ?? null,
    driverId: data.driverId ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

async function findCorruptedOrders(db) {
  const snap = await db
    .collection('orders')
    .where('assignedDriverId', '==', DRIVER_ID)
    .where('deliveryStatus', '==', 'driver_assigned')
    .where('status', '==', 'payment_confirmed')
    .get();

  return snap.docs.map((doc) => doc.id);
}

async function applyFix(db, orderId, reason) {
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();

  if (!snap.exists) {
    console.log('[fix-orders] MISSING', { orderId, reason });
    return { orderId, action: 'missing' };
  }

  const before = snap.data();
  console.log('[fix-orders] BEFORE', { orderId, reason, ...snapshotFields(before) });

  const patch = {
    ...TERMINAL_PATCH,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!DRY_RUN) {
    await ref.set(patch, { merge: true });
  }

  console.log('[fix-orders] AFTER', {
    orderId,
    reason,
    dryRun: DRY_RUN,
    ...TERMINAL_PATCH,
    updatedAt: DRY_RUN ? '(serverTimestamp pending)' : '(serverTimestamp written)',
  });

  return { orderId, action: DRY_RUN ? 'dry_run' : 'updated', reason };
}

async function main() {
  if (process.cwd() !== REPO_ROOT) {
    console.warn(
      '[fix-orders] warning: cwd is',
      process.cwd(),
      '— recommended: cd ~/ourfood-clean && node fix-orders.js',
    );
  }

  const db = initFirebase();

  console.log('[fix-orders] dryRun', DRY_RUN);
  console.log('[fix-orders] driver', DRIVER_ID);
  console.log('[fix-orders] explicit ids', EXPLICIT_ORDER_IDS.join(', '));

  const queryMatches = await findCorruptedOrders(db);
  console.log('[fix-orders] query matches', queryMatches.length, queryMatches);

  const allIds = [...new Set([...EXPLICIT_ORDER_IDS, ...queryMatches])];
  const results = [];

  for (const orderId of allIds) {
    let reason = 'explicit';
    if (EXPLICIT_ORDER_IDS.includes(orderId) && queryMatches.includes(orderId)) {
      reason = 'explicit+query_match';
    } else if (!EXPLICIT_ORDER_IDS.includes(orderId)) {
      reason = 'query_match';
    }
    results.push(await applyFix(db, orderId, reason));
  }

  console.log('[fix-orders] summary', {
    total: results.length,
    updated: results.filter((r) => r.action === 'updated').length,
    dryRun: results.filter((r) => r.action === 'dry_run').length,
    missing: results.filter((r) => r.action === 'missing').length,
  });

  if (DRY_RUN) {
    console.log('[fix-orders] DRY_RUN — no writes. Unset DRY_RUN to apply.');
  }
}

main().catch((err) => {
  console.error('[fix-orders] fatal', err.message || err);
  if (String(err.message || '').includes('Could not load the default credentials')) {
    console.error(
      '[fix-orders] Fix credentials:\n' +
        '  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json\n' +
        '  OR: gcloud auth application-default login --project halforfer',
    );
  }
  process.exit(1);
});
