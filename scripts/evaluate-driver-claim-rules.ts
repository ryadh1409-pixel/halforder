/**
 * Evaluate driver claim rule predicates for ready_for_pickup → driver_assigned.
 * Run: npx tsx scripts/evaluate-driver-claim-rules.ts
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLAIM_ALLOWED = [
  'driverId',
  'assignedDriverId',
  'driverName',
  'driverPhone',
  'driverVehicle',
  'deliveryStatus',
  'status',
  'driver',
  'acceptedAt',
  'updatedAt',
  'deliveryPin',
  'estimatedDeliveryMinutes',
  'estimatedDeliveryTime',
  'updatedBy',
];

const POOL_COURIER = new Set([
  'pending',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'waiting_driver',
  'ready',
  'accepted_for_delivery',
  'pending_driver',
]);

function affectedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();
}

function evaluateClaimRules(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  authUid: string,
): Record<string, boolean> {
  const keys = affectedKeys(before, after);
  const beforeDs = String(before.deliveryStatus ?? '');
  const afterDs = String(after.deliveryStatus ?? '');
  const beforeStatus = String(before.status ?? '');
  const afterStatus = String(after.status ?? '');
  const ps = String(before.paymentStatus ?? '').toLowerCase();

  const kitchenOk =
    afterStatus === beforeStatus ||
    (afterStatus === 'driver_assigned' &&
      ['', 'pending_driver', 'payment_confirmed', 'pending', 'awaiting_payment', 'accepted', 'restaurant_accepted', 'preparing', 'ready_for_pickup'].includes(
        beforeStatus,
      ));

  const driverBlob = after.driver as Record<string, unknown> | undefined;
  const driverBlobOk =
    !keys.includes('driver') ||
    (typeof driverBlob === 'object' &&
      driverBlob !== null &&
      driverBlob.id === authUid &&
      typeof driverBlob.name === 'string' &&
      driverBlob.name.length > 0 &&
      driverBlob.name.length <= 120);

  return {
    deliveryType_delivery: before.deliveryType === 'delivery',
    marketplaceOrderPaidOk: ps === 'paid' || ps === 'succeeded' || ps === 'complete',
    notArchived: before.marketplaceArchived !== true,
    notExpired: before.expired !== true,
    notTerminalForClaim:
      beforeStatus !== 'cancelled' &&
      beforeStatus !== 'rejected' &&
      afterDs !== 'cancelled' &&
      beforeDs !== 'delivered',
    orderUnassigned:
      !(typeof before.driverId === 'string' && before.driverId.length > 0) &&
      !(typeof before.assignedDriverId === 'string' && before.assignedDriverId.length > 0),
    deliveryTransitionOk:
      afterDs === 'driver_assigned' && POOL_COURIER.has(beforeDs) && beforeDs !== 'driver_assigned',
    afterDriverId_auth: after.driverId === authUid,
    afterAssignedDriverId_auth: after.assignedDriverId === authUid,
    driverIds_match: after.driverId === after.assignedDriverId,
    driverClaimKitchenStatusOk: kitchenOk,
    driverClaimAllowedKeys: keys.length > 0 && keys.every((k) => CLAIM_ALLOWED.includes(k)),
    driverClaimDriverBlobOk: driverBlobOk,
    driverClaimUpdatedByOk:
      !keys.includes('updatedBy') ||
      (typeof after.updatedBy === 'string' && after.updatedBy.length > 0 && after.updatedBy.length <= 160),
    driverClaimImmutableFieldsOk:
      before.paymentStatus === after.paymentStatus &&
      before.userId === after.userId &&
      before.customerId === after.customerId &&
      before.restaurantId === after.restaurantId &&
      before.totalPrice === after.totalPrice &&
      before.total === after.total &&
      JSON.stringify(before.items) === JSON.stringify(after.items),
    affectedKeys: keys as unknown as boolean,
  };
}

function buildClaimPatch(driverUid: string, includeStatus: boolean): Record<string, unknown> {
  return {
    driverId: driverUid,
    assignedDriverId: driverUid,
    driverName: 'Tkal',
    driverPhone: null,
    driver: { id: driverUid, name: 'Tkal', phone: null, vehicle: null, avatar: null },
    deliveryStatus: 'driver_assigned',
    ...(includeStatus ? { status: 'driver_assigned' } : {}),
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    estimatedDeliveryMinutes: 18,
    estimatedDeliveryTime: 18,
    deliveryPin: '1234',
    updatedBy: 'driverService.ts#claimMarketplaceDriverOrder',
  };
}

async function main(): Promise<void> {
  const rules = readFileSync(path.resolve(__dirname, '../firestore.rules'), 'utf8');
  const testEnv = await initializeTestEnvironment({
    projectId: 'eval-driver-claim',
    firestore: { host: '127.0.0.1', port: 8080, rules },
  });

  const minimalBefore = {
    userId: 'cust1',
    customerId: 'cust1',
    restaurantId: 'rest_abc',
    venueId: 'rest_abc',
    status: 'ready_for_pickup',
    deliveryStatus: 'ready_for_pickup',
    paymentStatus: 'paid',
    deliveryType: 'delivery',
    driverId: null,
    assignedDriverId: null,
    totalPrice: 15,
    total: 15,
    items: [{ id: 'item1', name: 'Burger', price: 12, qty: 1 }],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  let fullBefore: Record<string, unknown> = minimalBefore;
  try {
    fullBefore = JSON.parse(
      readFileSync(path.resolve(__dirname, '.order-9PT5-snapshot.json'), 'utf8'),
    ) as Record<string, unknown>;
    fullBefore = {
      ...fullBefore,
      status: 'ready_for_pickup',
      deliveryStatus: 'ready_for_pickup',
      driverId: null,
      assignedDriverId: null,
    };
  } catch {
    // use minimal
  }

  const driverUid = '9XN334yG4hOglrOYfsehHPDM5zP2';

  for (const label of ['minimal', 'full'] as const) {
    const before = label === 'minimal' ? minimalBefore : fullBefore;

    for (const includeStatus of [false, true] as const) {
      const orderId = `claim_eval_${label}_${includeStatus ? 'with' : 'no'}_status`;
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'drivers', driverUid), { name: 'Tkal' });
        await setDoc(doc(ctx.firestore(), 'users', driverUid), { role: 'driver' });
        await setDoc(doc(ctx.firestore(), 'orders', orderId), before);
      });

      const patch = buildClaimPatch(driverUid, includeStatus);
      const merged = { ...before, ...patch };
      const preds = evaluateClaimRules(before, merged as Record<string, unknown>, driverUid);
      const failing = Object.entries(preds).filter(([, v]) => v === false);

      process.stdout.write(`\n=== ${label} includeStatus=${includeStatus} ===\n`);
      process.stdout.write(`affectedKeys: ${JSON.stringify(affectedKeys(before, merged as Record<string, unknown>))}\n`);
      for (const [k, v] of Object.entries(preds)) {
        if (k !== 'affectedKeys') process.stdout.write(`${v ? 'PASS' : 'FAIL'} ${k}\n`);
      }
      if (failing.length) {
        process.stdout.write(`FAILING: ${failing.map(([k]) => k).join(', ')}\n`);
      }

      const db = testEnv.authenticatedContext(driverUid, { role: 'driver' }).firestore();
      try {
        await assertSucceeds(updateDoc(doc(db, 'orders', orderId), patch));
        process.stdout.write('EMULATOR: SUCCEEDED\n');
      } catch (e) {
        process.stdout.write(`EMULATOR: FAILED ${String(e)}\n`);
        try {
          await updateDoc(doc(db, 'orders', orderId), patch);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stdout.write(`RAW: ${msg.split('\n')[0]}\n`);
        }
      }
    }
  }

  await testEnv.cleanup();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
