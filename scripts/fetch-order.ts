/**
 * Fetch and print a single Firestore order document (admin).
 * Usage: npx ts-node --transpile-only scripts/fetch-order.ts <orderId>
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ID = process.env.PROJECT_ID?.trim() || 'halforfer';
const ORDER_ID = process.argv[2]?.trim() || 'uMIFqPqbxlE9AjNp7dAx';

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

function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { _type: 'Timestamp', iso: value.toDate().toISOString(), ms: value.toMillis() };
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serialize(v);
    }
    return out;
  }
  return value;
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

async function main(): Promise<void> {
  const db = initDb();
  const snap = await db.collection('orders').doc(ORDER_ID).get();
  if (!snap.exists) {
    console.log(JSON.stringify({ error: 'NOT_FOUND', orderId: ORDER_ID }));
    process.exit(1);
  }
  const data = snap.data()!;
  const keys = [
    'createdAt',
    'acceptedAt',
    'assignedAt',
    'pickedUpAt',
    'deliveredAt',
    'completedAt',
    'updatedAt',
    'paidAt',
    'driverId',
    'assignedDriverId',
    'userId',
    'customerId',
    'restaurantId',
    'paymentIntentId',
    'stripePaymentIntentId',
    'status',
    'deliveryStatus',
    'paymentStatus',
    'marketplaceArchived',
    'earningsRecorded',
    'updatedBy',
    'timeline',
  ];
  const summary: Record<string, unknown> = { orderId: ORDER_ID };
  for (const k of keys) {
    if (k in data) summary[k] = serialize(data[k]);
  }
  console.log('=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log('=== FULL DOCUMENT ===');
  console.log(JSON.stringify({ id: snap.id, ...serialize(data) }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
