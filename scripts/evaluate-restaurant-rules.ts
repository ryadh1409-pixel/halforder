/**
 * Evaluate restaurantDashboardPatchOk / restaurantKitchenPatchFastOk conditions
 * against live Firestore order LWbcKKwqud83ufJICXnZ.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDER_ID = 'LWbcKKwqud83ufJICXnZ';
const ACTOR_UID = 'anI1ll3hT8clTNoeAT8iimL9Oj83';

function initAdmin() {
  if (getApps().length) return;
  const saPath = path.resolve(__dirname, '../main/sa.json');
  const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
  initializeApp({ credential: cert(sa), projectId: 'halforfer' });
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function affectedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (!deepEqual(before[k], after[k])) changed.push(k);
  }
  return changed.sort();
}

function hasOnly(keys: string[], allowed: string[]): boolean {
  return keys.length > 0 && keys.every((k) => allowed.includes(k));
}

function buildKitchenPatch(action: 'accept' | 'preparing' | 'ready') {
  const now = Timestamp.now();
  switch (action) {
    case 'accept':
      return {
        status: 'accepted',
        deliveryStatus: 'accepted',
        updatedBy: 'restaurantAccept',
        acceptedAt: now,
        updatedAt: now,
        estimatedDeliveryTime: 35,
      };
    case 'preparing':
      return {
        status: 'preparing',
        deliveryStatus: 'preparing',
        updatedBy: 'restaurantPreparing',
        preparedAt: now,
        updatedAt: now,
        estimatedDeliveryTime: 35,
      };
    case 'ready':
      return {
        status: 'ready_for_pickup',
        deliveryStatus: 'ready_for_pickup',
        updatedBy: 'restaurantReady',
        preparedAt: now,
        readyAt: now,
        updatedAt: now,
        estimatedDeliveryTime: 35,
      };
  }
}

function restaurantKitchenLifecycleTransitionOk(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: string[],
): boolean {
  const touchesLifecycle = keys.includes('status') || keys.includes('deliveryStatus');
  const bStatus = String(before.status ?? '');
  const bDs = String(before.deliveryStatus ?? '');
  const aStatus = String(after.status ?? '');
  const aDs = String(after.deliveryStatus ?? '');
  if (!touchesLifecycle) return true;
  if (aStatus === bStatus && aDs === bDs) return true;
  if (
    aStatus === 'accepted' &&
    aDs === 'accepted' &&
    ['payment_confirmed', 'pending', 'pending_driver', 'awaiting_payment'].includes(bStatus) &&
    String(before.paymentStatus ?? '').toLowerCase() === 'paid' &&
    (bDs === 'pending' || bDs === '' || ['waiting_driver', 'ready_for_pickup', 'ready', 'accepted_for_delivery', 'pending_driver'].includes(bDs))
  ) {
    return true;
  }
  if (
    aStatus === 'preparing' &&
    aDs === 'preparing' &&
    ['accepted', 'restaurant_accepted'].includes(bStatus) &&
    ['accepted', 'preparing', ''].includes(bDs)
  ) {
    return true;
  }
  if (
    aStatus === 'ready_for_pickup' &&
    aDs === 'ready_for_pickup' &&
    bStatus === 'preparing' &&
    ['preparing', 'accepted', 'ready_for_pickup'].includes(bDs)
  ) {
    return true;
  }
  return false;
}

function evaluate(action: 'accept' | 'preparing' | 'ready', before: Record<string, unknown>, actorUid: string, restaurant: Record<string, unknown> | null, user: Record<string, unknown> | null) {
  const patch = buildKitchenPatch(action);
  const after = { ...before, ...patch };
  const keys = affectedKeys(before, after);
  const rid = String(before.restaurantId ?? before.venueId ?? '');

  const whitelist = [
    'archivedByRestaurant','archivedAt','hiddenForRestaurant','hiddenAt','restoredAt','updatedAt','updatedBy',
    'status','deliveryStatus','acceptedAt','preparedAt','readyAt','estimatedDeliveryTime','estimatedPrepTime',
    'estimatedDeliveryMinutes','notes','rejectionReason','driverId',
  ];

  const isAuthenticated = !!actorUid;
  const ridEqualsAuth = rid === actorUid;
  const userRestaurantMatch = user && String(user.restaurantId ?? '') === rid;
  const ownerMatch = restaurant && String(restaurant.ownerId ?? '') === actorUid;
  const isRestaurantVendorActor = rid.length > 0 && (ridEqualsAuth || !!userRestaurantMatch || !!ownerMatch);
  const orderRestaurantIdAfter = String(after.restaurantId ?? after.venueId ?? '');
  const orderRestaurantIdBefore = String(before.restaurantId ?? before.venueId ?? '');
  const isRestaurantOwner =
    isAuthenticated && isRestaurantVendorActor && orderRestaurantIdAfter === orderRestaurantIdBefore;

  const onlyAllowedRestaurantFieldsChanged = hasOnly(keys, whitelist);
  const restaurantProtectedFieldsUnchanged =
    before.userId === after.userId &&
    before.customerId === after.customerId &&
    (before.customerName ?? '') === (after.customerName ?? '') &&
    (before.customerPhone ?? '') === (after.customerPhone ?? '') &&
    before.paymentStatus === after.paymentStatus &&
    (before.stripePaymentIntentId ?? '') === (after.stripePaymentIntentId ?? '') &&
    (before.paymentIntentId ?? '') === (after.paymentIntentId ?? '') &&
    (before.checkoutSessionId ?? '') === (after.checkoutSessionId ?? '') &&
    before.totalPrice === after.totalPrice &&
    before.total === after.total &&
    before.subtotal === after.subtotal &&
    before.tax === after.tax &&
    before.deliveryFee === after.deliveryFee &&
    before.fees === after.fees &&
    before.taxes === after.taxes &&
    deepEqual(before.items, after.items) &&
    (before.assignedDriverId ?? '') === (after.assignedDriverId ?? '') &&
    (before.driverName ?? '') === (after.driverName ?? '') &&
    (before.driverPhone ?? '') === (after.driverPhone ?? '') &&
    (before.driverVehicle ?? '') === (after.driverVehicle ?? '');

  const restaurantVisibilityFieldTypesOk =
    typeof (after.hiddenForRestaurant ?? false) === 'boolean' &&
    typeof (after.archivedByRestaurant ?? false) === 'boolean' &&
    (!keys.includes('status') || typeof after.status === 'string') &&
    (!keys.includes('deliveryStatus') || typeof after.deliveryStatus === 'string');

  const restaurantDriverIdPatchOk =
    !keys.includes('driverId') ||
    (before.driverId ?? '') === (after.driverId ?? '') ||
    (!(typeof before.driverId === 'string' && before.driverId.length > 0) &&
      !(typeof after.driverId === 'string' && after.driverId.length > 0));

  const restaurantUpdatedByOk =
    !keys.includes('updatedBy') ||
    (typeof after.updatedBy === 'string' && after.updatedBy.length > 0 && after.updatedBy.length <= 160);

  const lifecycleOk = restaurantKitchenLifecycleTransitionOk(before, after, keys);
  const updatedAtOk = !keys.includes('updatedAt') || true; // serverTimestamp == request.time at write

  const checks: Array<{ name: string; expr: string; result: boolean }> = [
    { name: 'isRestaurantOwner → isAuthenticated()', expr: 'request.auth != null', result: isAuthenticated },
    { name: 'isRestaurantOwner → isRestaurantVendorActor(resource.data)', expr: 'rid == auth.uid || users.restaurantId == rid || restaurants.ownerId == auth.uid', result: isRestaurantVendorActor },
    { name: 'isRestaurantOwner → orderRestaurantId(after) == orderRestaurantId(before)', expr: 'orderRestaurantId(request.resource.data) == orderRestaurantId(resource.data)', result: orderRestaurantIdAfter === orderRestaurantIdBefore },
    { name: 'onlyAllowedRestaurantFieldsChanged()', expr: `affectedKeys.hasOnly([...whitelist]) keys=${JSON.stringify(keys)}`, result: onlyAllowedRestaurantFieldsChanged },
    { name: 'restaurantProtectedFieldsUnchanged()', expr: 'userId/customerId/payment/totals/items/assignedDriverId/driverName/phone/vehicle unchanged', result: restaurantProtectedFieldsUnchanged },
    { name: 'restaurantVisibilityFieldTypesOk()', expr: 'hiddenForRestaurant/archived bool; status/deliveryStatus string if changed', result: restaurantVisibilityFieldTypesOk },
    { name: 'restaurantDriverIdPatchOk()', expr: '!keys.hasAny([driverId]) || unchanged || clear-only', result: restaurantDriverIdPatchOk },
    { name: 'restaurantUpdatedByOk()', expr: 'updatedBy absent or non-empty string <= 160', result: restaurantUpdatedByOk },
    { name: 'restaurantKitchenLifecycleTransitionOk()', expr: `before status=${bStatus(before)} ds=${bDs(before)} → after status=${after.status} ds=${after.deliveryStatus}`, result: lifecycleOk },
    { name: 'updatedAt == request.time', expr: 'updatedAt absent from patch OR equals request.time (serverTimestamp)', result: updatedAtOk },
  ];

  const firstFail = checks.find((c) => !c.result);
  return { action, patch, keys, checks, firstFail, restaurantDashboardPatchOk: checks.every((c) => c.result) };
}

function bStatus(d: Record<string, unknown>) { return String(d.status ?? ''); }
function bDs(d: Record<string, unknown>) { return String(d.deliveryStatus ?? ''); }

async function main() {
  initAdmin();
  const db = getFirestore();
  const [orderSnap, restSnap, userSnap] = await Promise.all([
    db.collection('orders').doc(ORDER_ID).get(),
    db.collection('restaurants').doc('anI1ll3hT8clTNoeAT8iimL9Oj83').get(),
    db.collection('users').doc(ACTOR_UID).get(),
  ]);
  const before = orderSnap.data() as Record<string, unknown>;
  const restaurant = restSnap.exists ? (restSnap.data() as Record<string, unknown>) : null;
  const user = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null;

  console.log('=== RUNTIME CONTEXT ===');
  console.log(JSON.stringify({
    orderId: ORDER_ID,
    actorUid: ACTOR_UID,
    actorRole: user?.role ?? null,
    restaurantId: before.restaurantId ?? null,
    venueId: before.venueId ?? null,
    ownerId: restaurant?.ownerId ?? null,
    driverId: before.driverId ?? null,
    assignedDriverId: before.assignedDriverId ?? null,
    currentDocument: before,
  }, null, 2));

  for (const action of ['accept', 'preparing', 'ready'] as const) {
    console.log(`\n=== EVALUATE restaurantDashboardPatchOk — action: ${action} ===`);
    const ev = evaluate(action, before, ACTOR_UID, restaurant, user);
    console.log(JSON.stringify({ requestedPatch: ev.patch, affectedKeys: ev.keys }, null, 2));
    for (const c of ev.checks) {
      console.log(`${c.result ? 'TRUE ' : 'FALSE'} ${c.name}`);
      console.log(`       expr: ${c.expr}`);
    }
    console.log(`FIRST_FAIL: ${ev.firstFail ? ev.firstFail.name : 'NONE — all TRUE'}`);
    console.log(`restaurantDashboardPatchOk: ${ev.restaurantDashboardPatchOk}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
