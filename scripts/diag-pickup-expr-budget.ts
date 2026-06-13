/** Diagnostic: pickup with full production order snapshot (same live rules). */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDER_ID = '9PT5ur6jRTwpFHZ9nRze';
const DRIVER_UID = '9XN334yG4hOglrOYfsehHPDM5zP2';

function reviveTimestamps(value: unknown): unknown {
  if (value && typeof value === 'object' && '_seconds' in (value as object)) {
    const v = value as { _seconds: number; _nanoseconds?: number };
    return new Timestamp(v._seconds, v._nanoseconds ?? 0);
  }
  if (Array.isArray(value)) return value.map(reviveTimestamps);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, reviveTimestamps(v)]),
    );
  }
  return value;
}

async function main(): Promise<void> {
  const rules = readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
  const raw = JSON.parse(
    readFileSync(path.resolve(__dirname, '.order-9PT5-snapshot.json'), 'utf8'),
  ) as Record<string, unknown>;
  const fullOrder = reviveTimestamps(raw) as Record<string, unknown>;
  const patch = {
    deliveryStatus: 'picked_up',
    status: 'picked_up',
    pickedUpAt: serverTimestamp(),
    updatedBy: 'driverMarketplacePickup',
    updatedAt: serverTimestamp(),
  };

  const testEnv = await initializeTestEnvironment({
    projectId: 'diag-pickup-expr',
    firestore: { host: '127.0.0.1', port: 8080, rules },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'drivers', DRIVER_UID), { name: 'Tkal' });
    await setDoc(doc(ctx.firestore(), 'users', DRIVER_UID), { role: 'driver', restricted: false });
    await setDoc(doc(ctx.firestore(), `orders/${ORDER_ID}`), fullOrder);
  });

  const db = testEnv.authenticatedContext(DRIVER_UID, { role: 'driver' }).firestore();

  try {
    await assertSucceeds(updateDoc(doc(db, 'orders', ORDER_ID), patch));
    process.stdout.write('FULL_PRODUCTION_DOC: SUCCEEDED\n');
  } catch (e) {
    process.stdout.write(`FULL_PRODUCTION_DOC: FAILED ${String(e)}\n`);
  }

  await testEnv.cleanup();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
