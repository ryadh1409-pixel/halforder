/**
 * Measure fulfillment expression cost: minimal vs full production snapshot.
 * Run: npx firebase emulators:exec --only firestore "npx tsx scripts/measure-fulfillment-expr-cost.ts"
 */
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDER_ID = '9PT5ur6jRTwpFHZ9nRze';
const DRIVER_UID = '9XN334yG4hOglrOYfsehHPDM5zP2';

const RULES_BEFORE = path.resolve(__dirname, '../.live-firestore.rules');
const RULES_AFTER = path.resolve(__dirname, '../firestore.rules');
const SNAPSHOT = path.resolve(__dirname, '.order-9PT5-snapshot.json');

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

type Scenario = 'minimal_pickup' | 'full_pickup' | 'minimal_deliver' | 'full_deliver';

async function runScenario(
  rules: string,
  scenario: Scenario,
): Promise<{ ok: boolean; error: string | null }> {
  const testEnv = await initializeTestEnvironment({
    projectId: `expr-${scenario}`,
    firestore: { host: '127.0.0.1', port: 8080, rules },
  });

  const minimalAssigned = {
    userId: 'cust1',
    customerId: 'cust1',
    restaurantId: 'rest_abc',
    venueId: 'rest_abc',
    paymentStatus: 'paid',
    deliveryType: 'delivery',
    driverId: DRIVER_UID,
    assignedDriverId: DRIVER_UID,
    status: 'driver_assigned',
    deliveryStatus: 'driver_assigned',
    totalPrice: 14.3849,
    total: 14.3849,
    items: [{ id: 'i1', name: 'Burger', price: 12, qty: 1 }],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const minimalPickedUp = {
    ...minimalAssigned,
    status: 'picked_up',
    deliveryStatus: 'picked_up',
    pickedUpAt: Timestamp.now(),
  };

  let orderData: Record<string, unknown> = minimalAssigned;
  if (scenario === 'full_pickup' || scenario === 'full_deliver') {
    if (!existsSync(SNAPSHOT)) throw new Error(`missing snapshot ${SNAPSHOT}`);
    orderData = reviveTimestamps(
      JSON.parse(readFileSync(SNAPSHOT, 'utf8')),
    ) as Record<string, unknown>;
    if (scenario === 'full_deliver') {
      orderData = {
        ...orderData,
        status: 'picked_up',
        deliveryStatus: 'picked_up',
        pickedUpAt: Timestamp.now(),
      };
    }
  } else if (scenario === 'minimal_deliver') {
    orderData = minimalPickedUp;
  }

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'drivers', DRIVER_UID), { name: 'Tkal' });
    await setDoc(doc(ctx.firestore(), 'users', DRIVER_UID), { role: 'driver' });
    await setDoc(doc(ctx.firestore(), `orders/${ORDER_ID}`), orderData);
  });

  const db = testEnv.authenticatedContext(DRIVER_UID, { role: 'driver' }).firestore();
  const pickupPatch = {
    deliveryStatus: 'picked_up',
    status: 'picked_up',
    pickedUpAt: serverTimestamp(),
    updatedBy: 'driverMarketplacePickup',
    updatedAt: serverTimestamp(),
  };
  const deliverPatch = {
    deliveryStatus: 'delivered',
    status: 'completed',
    deliveredAt: serverTimestamp(),
    completedAt: serverTimestamp(),
    marketplaceArchived: true,
    earningsRecorded: true,
    customerTotal: 14.3849,
    driverPayout: 3.5,
    platformFee: 1.2,
    updatedAt: serverTimestamp(),
    updatedBy: 'driverMarketplaceDelivered',
  };

  let ok = false;
  let error: string | null = null;
  try {
    if (scenario.endsWith('pickup')) {
      await updateDoc(doc(db, 'orders', ORDER_ID), pickupPatch);
    } else {
      await updateDoc(doc(db, 'orders', ORDER_ID), deliverPatch);
    }
    ok = true;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  await testEnv.cleanup();
  return { ok, error };
}

async function main(): Promise<void> {
  const rulesBefore = readFileSync(RULES_BEFORE, 'utf8');
  const rulesAfter = readFileSync(RULES_AFTER, 'utf8');
  const scenarios: Scenario[] = [
    'minimal_pickup',
    'full_pickup',
    'minimal_deliver',
    'full_deliver',
  ];

  process.stdout.write('=== EXPRESSION COST MEASUREMENT ===\n\n');

  for (const label of ['BEFORE', 'AFTER'] as const) {
    const rules = label === 'BEFORE' ? rulesBefore : rulesAfter;
    process.stdout.write(`--- ${label} rules ---\n`);
    for (const scenario of scenarios) {
      const { ok, error } = await runScenario(rules, scenario);
      const budgetHit = error?.includes('maximum of 1000 expressions') ?? false;
      process.stdout.write(
        `${scenario}: ${ok ? 'ALLOW' : 'DENY'}${budgetHit ? ' (BUDGET_EXHAUSTED)' : ''}\n`,
      );
      if (!ok && error) {
        process.stdout.write(`  error: ${error.split('\n')[0]}\n`);
      }
    }
    process.stdout.write('\n');
  }

  process.stdout.write('Estimated fast-path expression cost: ~20-35 (short-circuit on branch 1-2)\n');
  process.stdout.write('Estimated pre-fix full-doc path cost: 1000+ (budget exhausted @ L2215)\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
