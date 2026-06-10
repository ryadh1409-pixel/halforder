#!/usr/bin/env node
/**
 * One-time migration: terminalize stale marketplace orders stuck at
 * payment_confirmed + driver_assigned (assigned but never completed).
 *
 * Usage (repo root):
 *   npm install
 *   DRY_RUN=1 STALE_HOURS=48 node scripts/migrate-stale-driver-assigned-orders.js
 *   STALE_HOURS=48 node scripts/migrate-stale-driver-assigned-orders.js
 *
 * Env:
 *   DRY_RUN=1          — log only, no writes (default: write)
 *   STALE_HOURS=48     — minimum age since last activity (default 48)
 *   PROJECT_ID         — default halforfer
 *   GOOGLE_APPLICATION_CREDENTIALS — service account or gcloud ADC
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PROJECT_ID = process.env.PROJECT_ID?.trim() || 'halforfer';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const STALE_HOURS = Number(process.env.STALE_HOURS ?? 48);
const STALE_MS = STALE_HOURS * 60 * 60 * 1000;
const SCAN_LIMIT = Number(process.env.SCAN_LIMIT ?? 500);

/** Historical IDs confirmed stuck — always evaluated (still subject to staleness + safety checks). */
const EXPLICIT_ORDER_IDS = [
  'UTUYBbiRjOX4GjlmKgPR',
  'j3n7Rql1V1NS43eHObay',
  'mKw82J5KETwsND2ATzBW',
  'f1rppqyrFPBnwpoNZ9nF',
  'a0YxCkp2WGmszmQrGxhk',
  'pjzOIKSf4uDRYPGknoRs',
  'tYUS6Bt3QqalJ0tYL26N',
  '13lgnWRjWj6HBA0BjkWs',
  'LgmahMe4jzDIAcZtWEt8',
  'T9hV5QKoFNpJj5vZHQA0',
  '6tJRR8LJmaXiGkgDzRUH',
  'rGlBcD2ggvdYsDugMYA3',
];

const STALE_KITCHEN = new Set(['payment_confirmed', 'pending_driver', 'driver_assigned', 'pending']);
const STALE_COURIER = new Set(['driver_assigned', 'pending']);
const TERMINAL_KITCHEN = new Set(['completed', 'delivered', 'cancelled', 'rejected', 'expired']);
const TERMINAL_COURIER = new Set(['delivered', 'completed', 'cancelled']);

const TERMINAL_PATCH = {
  status: 'completed',
  deliveryStatus: 'delivered',
  marketplaceArchived: true,
  earningsRecorded: true,
  updatedBy: 'migrate_stale_driver_assigned_orders',
};

const adminPath = path.join(REPO_ROOT, 'node_modules', 'firebase-admin');
if (!fs.existsSync(adminPath)) {
  console.error('[migrate-stale] firebase-admin missing. Run: npm install');
  process.exit(1);
}

const { initializeApp, getApps, applicationDefault, cert } = require('firebase-admin');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

function resolveCredentials() {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (envPath && fs.existsSync(path.resolve(envPath))) {
    return { mode: 'cert', certJson: JSON.parse(fs.readFileSync(path.resolve(envPath), 'utf8')) };
  }
  const discovered = [];
  function walk(dir, depth) {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full, depth + 1); continue; }
      if (!e.name.endsWith('.json')) continue;
      try {
        const p = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (p.type === 'service_account' && p.private_key) discovered.push(full);
      } catch { /* skip */ }
    }
  }
  walk(REPO_ROOT, 0);
  if (discovered[0]) {
    return { mode: 'cert', certJson: JSON.parse(fs.readFileSync(discovered[0], 'utf8')) };
  }
  return { mode: 'adc' };
}

function initDb() {
  if (getApps().length === 0) {
    const creds = resolveCredentials();
    initializeApp(
      creds.mode === 'cert'
        ? { credential: cert(creds.certJson), projectId: PROJECT_ID }
        : { credential: applicationDefault(), projectId: PROJECT_ID },
    );
  }
  return getFirestore();
}

function norm(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

function toMillis(v) {
  if (v == null) return null;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'object' && v !== null && typeof v.toDate === 'function') {
    return v.toDate().getTime();
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return null;
}

function lastActivityMs(data) {
  const ms = [
    toMillis(data.updatedAt),
    toMillis(data.acceptedAt),
    toMillis(data.createdAt),
    toMillis(data.paidAt),
  ].filter((x) => x != null);
  return ms.length ? Math.max(...ms) : null;
}

function isTerminal(data) {
  if (data.earningsRecorded === true) return true;
  if (data.marketplaceArchived === true) {
    const c = norm(data.deliveryStatus);
    if (TERMINAL_COURIER.has(c)) return true;
  }
  const k = norm(data.status);
  const c = norm(data.deliveryStatus);
  if (TERMINAL_KITCHEN.has(k)) return true;
  if (TERMINAL_COURIER.has(c)) return true;
  if (toMillis(data.deliveredAt) || toMillis(data.completedAt)) return true;
  return false;
}

function hasDriver(data) {
  return norm(data.driverId).length > 0 || norm(data.assignedDriverId).length > 0;
}

function isStaleCandidate(data, nowMs) {
  if (!hasDriver(data)) return { ok: false, reason: 'no_driver' };
  if (isTerminal(data)) return { ok: false, reason: 'already_terminal' };
  if (data.expired === true) return { ok: false, reason: 'expired_flag' };
  const kitchen = norm(data.status);
  const courier = norm(data.deliveryStatus);
  if (!STALE_KITCHEN.has(kitchen)) return { ok: false, reason: `kitchen_${kitchen || 'empty'}` };
  if (!STALE_COURIER.has(courier)) return { ok: false, reason: `courier_${courier || 'empty'}` };
  const activity = lastActivityMs(data);
  if (activity == null) return { ok: false, reason: 'no_timestamp' };
  if (nowMs - activity < STALE_MS) return { ok: false, reason: 'too_recent' };
  return { ok: true, reason: 'stale_assigned' };
}

function snapshotFields(data) {
  return {
    status: data.status ?? null,
    deliveryStatus: data.deliveryStatus ?? null,
    driverId: data.driverId ?? null,
    assignedDriverId: data.assignedDriverId ?? null,
    earningsRecorded: data.earningsRecorded ?? null,
    marketplaceArchived: data.marketplaceArchived ?? null,
    lastActivityMs: lastActivityMs(data),
  };
}

async function queryStuckOrders(db) {
  const ids = new Set();
  const queries = [
    db.collection('orders').where('deliveryStatus', '==', 'driver_assigned').where('status', '==', 'payment_confirmed').limit(SCAN_LIMIT),
    db.collection('orders').where('deliveryStatus', '==', 'driver_assigned').where('status', '==', 'pending_driver').limit(SCAN_LIMIT),
  ];
  for (const q of queries) {
    try {
      const snap = await q.get();
      for (const doc of snap.docs) ids.add(doc.id);
    } catch (err) {
      console.warn('[migrate-stale] query failed (index may be required):', err.message);
    }
  }
  return [...ids];
}

async function applyMigration(db, orderId, reason) {
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { orderId, action: 'missing', reason };
  }
  const data = snap.data();
  const nowMs = Date.now();
  const check = isStaleCandidate(data, nowMs);

  console.log('[migrate-stale] BEFORE', { orderId, reason, ...snapshotFields(data), check });

  if (!check.ok) {
    return { orderId, action: 'skipped', reason: check.reason };
  }

  const patch = {
    ...TERMINAL_PATCH,
    deliveredAt: FieldValue.serverTimestamp(),
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!DRY_RUN) {
    await ref.set(patch, { merge: true });
  }

  console.log('[migrate-stale] AFTER', {
    orderId,
    dryRun: DRY_RUN,
    reason,
    ...TERMINAL_PATCH,
    deliveredAt: 'serverTimestamp',
    completedAt: 'serverTimestamp',
  });

  return { orderId, action: DRY_RUN ? 'dry_run' : 'updated', reason };
}

async function main() {
  const db = initDb();
  const nowMs = Date.now();

  console.log('[migrate-stale] config', {
    projectId: PROJECT_ID,
    dryRun: DRY_RUN,
    staleHours: STALE_HOURS,
    staleMs: STALE_MS,
    scanLimit: SCAN_LIMIT,
    explicitCount: EXPLICIT_ORDER_IDS.length,
  });

  const queryIds = await queryStuckOrders(db);
  const allIds = [...new Set([...EXPLICIT_ORDER_IDS, ...queryIds])];
  console.log('[migrate-stale] candidates', { queryIds: queryIds.length, total: allIds.length });

  const results = [];
  for (const orderId of allIds) {
    const reason = EXPLICIT_ORDER_IDS.includes(orderId) ? 'explicit' : 'query';
    results.push(await applyMigration(db, orderId, reason));
  }

  const summary = {
    total: results.length,
    updated: results.filter((r) => r.action === 'updated').length,
    dryRun: results.filter((r) => r.action === 'dry_run').length,
    skipped: results.filter((r) => r.action === 'skipped').length,
    missing: results.filter((r) => r.action === 'missing').length,
  };
  console.log('[migrate-stale] summary', summary);

  if (DRY_RUN) {
    console.log('[migrate-stale] DRY_RUN complete — unset DRY_RUN to apply writes.');
  }
}

main().catch((err) => {
  console.error('[migrate-stale] fatal', err);
  process.exit(1);
});
