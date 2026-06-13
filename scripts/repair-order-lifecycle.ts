/**
 * Repair inconsistent marketplace lifecycle fields on a production order.
 * Run: npx tsx scripts/repair-order-lifecycle.ts uMIFqPqbxlE9AjNp7dAx
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildLifecycleConsistencyRepairPatch } from '../lib/marketplaceLifecycleSync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDER_ID = process.argv[2]?.trim() || 'uMIFqPqbxlE9AjNp7dAx';

async function main(): Promise<void> {
  if (!getApps().length) {
    const sa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../main/sa.json'), 'utf8'));
    initializeApp({ credential: cert(sa), projectId: 'halforfer' });
  }
  const db = getFirestore();
  const ref = db.doc(`orders/${ORDER_ID}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`Order ${ORDER_ID} not found`);

  const current = { id: ORDER_ID, ...snap.data() } as Record<string, unknown>;
  process.stdout.write(`BEFORE: status=${String(current.status)} deliveryStatus=${String(current.deliveryStatus)}\n`);

  const patch = buildLifecycleConsistencyRepairPatch(current);
  if (!patch) {
    process.stdout.write('NO_REPAIR_NEEDED\n');
    return;
  }

  patch.updatedBy = 'scripts/repair-order-lifecycle.ts';
  patch.updatedAt = new Date();
  await ref.set(patch, { merge: true });

  const after = await ref.get();
  const data = after.data() ?? {};
  process.stdout.write(
    `AFTER: status=${String(data.status)} deliveryStatus=${String(data.deliveryStatus)}\n`,
  );
  process.stdout.write(`PATCH: ${JSON.stringify(patch)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
