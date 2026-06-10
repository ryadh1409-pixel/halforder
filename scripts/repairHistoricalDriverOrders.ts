/**
 * One-time migration: archive stale marketplace orders stuck at driver_assigned.
 *
 * Criteria:
 *   - assignedDriverId or driverId present
 *   - deliveryStatus == driver_assigned
 *   - createdAt older than STALE_HOURS (default 24)
 *   - not already terminal
 *
 * Usage:
 *   DRY_RUN=1 npx ts-node --transpile-only scripts/repairHistoricalDriverOrders.ts
 *   npx ts-node --transpile-only scripts/repairHistoricalDriverOrders.ts
 *
 * Idempotent: records completion in system/migrations/repairHistoricalDriverOrders_v1
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  Timestamp,
  type DocumentData,
} from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = process.env.PROJECT_ID?.trim() || 'halforfer';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const STALE_HOURS = Number(process.env.STALE_HOURS ?? 24);
const STALE_MS = STALE_HOURS * 60 * 60 * 1000;
const SCAN_LIMIT = Number(process.env.SCAN_LIMIT ?? 500);
const MIGRATION_DOC = 'systemMigrations/repairHistoricalDriverOrders_v1';

const TERMINAL_PATCH = {
  status: 'completed',
  deliveryStatus: 'delivered',
  marketplaceArchived: true,
  earningsRecorded: true,
  updatedBy: 'repairHistoricalDriverOrders_v1',
};

function resolveCredentials(): { mode: 'cert' | 'adc'; certJson?: Record<string, unknown> } {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (envPath && fs.existsSync(path.resolve(envPath))) {
    return {
      mode: 'cert',
      certJson: JSON.parse(fs.readFileSync(path.resolve(envPath), 'utf8')) as Record<
        string,
        unknown
      >,
    };
  }
  const repoRoot = path.resolve(__dirname, '..');
  const discovered: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth > 6) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!e.name.endsWith('.json')) continue;
      try {
        const p = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, unknown>;
        if (p.type === 'service_account' && p.private_key) discovered.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(repoRoot, 0);
  if (discovered[0]) {
    return {
      mode: 'cert',
      certJson: JSON.parse(fs.readFileSync(discovered[0], 'utf8')) as Record<string, unknown>,
    };
  }
  return { mode: 'adc' };
}

function initDb() {
  if (getApps().length === 0) {
    const creds = resolveCredentials();
    initializeApp(
      creds.mode === 'cert' && creds.certJson
        ? { credential: cert(creds.certJson), projectId: PROJECT_ID }
        : { credential: applicationDefault(), projectId: PROJECT_ID },
    );
  }
  return getFirestore();
}

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

function toMillis(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    const d = (v as { toDate: () => Date }).toDate();
    return d.getTime();
  }
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return null;
}

function hasDriver(data: DocumentData): boolean {
  return norm(data.driverId).length > 0 || norm(data.assignedDriverId).length > 0;
}

function isTerminal(data: DocumentData): boolean {
  if (data.earningsRecorded === true) return true;
  if (data.marketplaceArchived === true) {
    const c = norm(data.deliveryStatus);
    if (c === 'delivered' || c === 'completed') return true;
  }
  const k = norm(data.status);
  const c = norm(data.deliveryStatus);
  return k === 'completed' || k === 'delivered' || c === 'delivered' || c === 'completed';
}

function createdAtMs(data: DocumentData): number | null {
  return toMillis(data.createdAt);
}

function isStaleCandidate(data: DocumentData, nowMs: number): { ok: boolean; reason: string } {
  if (!hasDriver(data)) return { ok: false, reason: 'no_driver' };
  if (isTerminal(data)) return { ok: false, reason: 'already_terminal' };
  if (norm(data.deliveryStatus) !== 'driver_assigned') {
    return { ok: false, reason: `courier_${norm(data.deliveryStatus) || 'empty'}` };
  }
  const created = createdAtMs(data);
  if (created == null) return { ok: false, reason: 'no_createdAt' };
  if (nowMs - created < STALE_MS) return { ok: false, reason: 'too_recent' };
  return { ok: true, reason: 'stale_assigned' };
}

async function migrationAlreadyRan(db: ReturnType<typeof getFirestore>): Promise<boolean> {
  const snap = await db.doc(MIGRATION_DOC).get();
  return snap.exists && snap.data()?.completed === true;
}

async function markMigrationComplete(
  db: ReturnType<typeof getFirestore>,
  summary: Record<string, unknown>,
): Promise<void> {
  if (DRY_RUN) return;
  await db.doc(MIGRATION_DOC).set(
    {
      completed: true,
      completedAt: FieldValue.serverTimestamp(),
      summary,
      staleHours: STALE_HOURS,
    },
    { merge: true },
  );
}

async function queryCandidates(db: ReturnType<typeof getFirestore>): Promise<string[]> {
  const ids = new Set<string>();
  const queries = [
    db
      .collection('orders')
      .where('deliveryStatus', '==', 'driver_assigned')
      .where('deliveryType', '==', 'delivery')
      .limit(SCAN_LIMIT),
  ];
  for (const q of queries) {
    const snap = await q.get();
    for (const doc of snap.docs) ids.add(doc.id);
  }
  return [...ids];
}

async function repairOrder(
  db: ReturnType<typeof getFirestore>,
  orderId: string,
  nowMs: number,
): Promise<{ orderId: string; action: string; reason?: string }> {
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return { orderId, action: 'missing' };

  const data = snap.data()!;
  const check = isStaleCandidate(data, nowMs);

  console.log('[repair-historical] BEFORE', {
    orderId,
    status: data.status ?? null,
    deliveryStatus: data.deliveryStatus ?? null,
    assignedDriverId: data.assignedDriverId ?? null,
    driverId: data.driverId ?? null,
    createdAtMs: createdAtMs(data),
    check,
  });

  if (!check.ok) return { orderId, action: 'skipped', reason: check.reason };

  const patch = {
    ...TERMINAL_PATCH,
    deliveredAt: FieldValue.serverTimestamp(),
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!DRY_RUN) {
    await ref.set(patch, { merge: true });
  }

  console.log('[repair-historical] AFTER', { orderId, dryRun: DRY_RUN, ...TERMINAL_PATCH });
  return { orderId, action: DRY_RUN ? 'dry_run' : 'updated', reason: check.reason };
}

async function main(): Promise<void> {
  const db = initDb();
  const nowMs = Date.now();

  console.log('[repair-historical] start', {
    projectId: PROJECT_ID,
    dryRun: DRY_RUN,
    staleHours: STALE_HOURS,
    migrationDoc: MIGRATION_DOC,
  });

  if (!DRY_RUN && (await migrationAlreadyRan(db))) {
    console.log('[repair-historical] already completed — skipping');
    return;
  }

  const ids = await queryCandidates(db);
  console.log('[repair-historical] scan', { candidates: ids.length });

  const results = [];
  for (const orderId of ids) {
    results.push(await repairOrder(db, orderId, nowMs));
  }

  const summary = {
    total: results.length,
    updated: results.filter((r) => r.action === 'updated').length,
    dryRun: results.filter((r) => r.action === 'dry_run').length,
    skipped: results.filter((r) => r.action === 'skipped').length,
    missing: results.filter((r) => r.action === 'missing').length,
  };

  console.log('[repair-historical] summary', summary);

  if (!DRY_RUN && summary.updated > 0) {
    await markMigrationComplete(db, summary);
    console.log('[repair-historical] migration recorded');
  } else if (DRY_RUN) {
    console.log('[repair-historical] DRY_RUN — no migration doc written');
  }
}

main().catch((err) => {
  console.error('[repair-historical] fatal', err);
  process.exit(1);
});
