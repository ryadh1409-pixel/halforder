/**
 * Real production Firestore pickup write for order 9PT5ur6jRTwpFHZ9nRze.
 * Captures [REAL FIRESTORE WRITE] immediately before updateDoc.
 *
 * Run: npx tsx scripts/capture-real-pickup-write.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDER_ID = process.env.ORDER_ID?.trim() || '9PT5ur6jRTwpFHZ9nRze';
const DRIVER_UID = process.env.DRIVER_UID?.trim() || '9XN334yG4hOglrOYfsehHPDM5zP2';

const originalLoad = (Module as unknown as { _load: Module['_load'] })._load;
(Module as unknown as { _load: Module['_load'] })._load = function (
  request: string,
  parent: Module,
  isMain: boolean,
) {
  if (request === 'react-native') {
    return { Platform: { OS: 'web' }, default: { Platform: { OS: 'web' } } };
  }
  if (request === '@react-native-async-storage/async-storage') {
    return {
      default: {
        getItem: async () => null,
        setItem: async () => undefined,
        removeItem: async () => undefined,
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

const DRIVER_MARKETPLACE_FULFILLMENT_PATCH_KEYS = [
  'deliveryStatus',
  'status',
  'pickedUpAt',
  'deliveredAt',
  'completedAt',
  'marketplaceArchived',
  'updatedAt',
  'updatedBy',
  'driverPayout',
  'platformFee',
  'customerTotal',
  'earningsRecorded',
] as const;

function analyzePatchKeys(safePatch: Record<string, unknown>): void {
  const affectedKeys = Object.keys(safePatch).sort();
  const allowed = new Set<string>(DRIVER_MARKETPLACE_FULFILLMENT_PATCH_KEYS);
  const offending = affectedKeys.filter((k) => !allowed.has(k));
  process.stdout.write('\n=== driverMarketplaceFulfillmentPatchKeysOk() analysis ===\n');
  process.stdout.write(`affectedKeys (${affectedKeys.length}): ${JSON.stringify(affectedKeys)}\n`);
  process.stdout.write(
    `hasOnly([...]) allowed (${DRIVER_MARKETPLACE_FULFILLMENT_PATCH_KEYS.length}): ${JSON.stringify(DRIVER_MARKETPLACE_FULFILLMENT_PATCH_KEYS)}\n`,
  );
  process.stdout.write(`offending keys: ${JSON.stringify(offending)}\n`);
  process.stdout.write(`driverMarketplaceFulfillmentPatchKeysOk: ${offending.length === 0 ? 'TRUE' : 'FALSE'}\n`);
}

async function main(): Promise<void> {
  const { cert, getApps, initializeApp: initAdmin } = await import('firebase-admin/app');
  const { getAuth: getAdminAuth } = await import('firebase-admin/auth');
  if (!getApps().length) {
    const sa = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../main/sa.json'), 'utf8'));
    initAdmin({ credential: cert(sa), projectId: 'halforfer' });
  }

  const customToken = await getAdminAuth().createCustomToken(DRIVER_UID, { role: 'driver' });

  const { signInWithCustomToken } = await import('firebase/auth');
  const { auth } = await import('../services/firebase');
  await signInWithCustomToken(auth, customToken);
  await auth.currentUser?.getIdToken(true);

  process.stdout.write(`\nSigned in as ${auth.currentUser?.uid ?? 'NONE'}\n`);

  let capturedRealWrite: Record<string, unknown> | null = null;
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0] === '[REAL FIRESTORE WRITE]' && typeof args[1] === 'string') {
      try {
        capturedRealWrite = JSON.parse(args[1]) as Record<string, unknown>;
      } catch {
        capturedRealWrite = { raw: args[1] };
      }
    }
    originalLog(...args);
  };

  const { applyDriverMarketplaceFulfillment } = await import('../lib/driverMarketplaceFulfillment');

  let thrown: unknown = null;
  try {
    await applyDriverMarketplaceFulfillment(ORDER_ID, 'pickup');
  } catch (error) {
    thrown = error;
  }

  console.log = originalLog;

  if (!capturedRealWrite) {
    process.stdout.write('\nNO [REAL FIRESTORE WRITE] captured (write may have been skipped client-side)\n');
    if (thrown) {
      process.stdout.write(`thrown: ${thrown instanceof Error ? thrown.message : String(thrown)}\n`);
    }
    process.exit(1);
  }

  process.stdout.write('\n=== 1. currentDocument ===\n');
  process.stdout.write(`${JSON.stringify(capturedRealWrite.currentDocument, null, 2)}\n`);

  process.stdout.write('\n=== 2. safePatch ===\n');
  process.stdout.write(`${JSON.stringify(capturedRealWrite.safePatch, null, 2)}\n`);

  process.stdout.write('\n=== 3. mergedDocument ===\n');
  process.stdout.write(`${JSON.stringify(capturedRealWrite.mergedDocument, null, 2)}\n`);

  analyzePatchKeys((capturedRealWrite.safePatch ?? {}) as Record<string, unknown>);

  if (thrown) {
    const err = thrown as { code?: string; message?: string };
    process.stdout.write('\n=== Firestore error after [REAL FIRESTORE WRITE] ===\n');
    process.stdout.write(`${JSON.stringify({ code: err.code ?? null, message: err.message ?? null }, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
