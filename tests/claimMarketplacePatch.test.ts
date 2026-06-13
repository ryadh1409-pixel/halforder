jest.mock('@/services/firebase', () => ({
  auth: { currentUser: { uid: 'drv1' } },
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  serverTimestamp: jest.fn(() => ({ _methodName: 'serverTimestamp' })),
}));

import { prepareProtectedOrderPatch } from '@/services/orderFirestoreWrite';
import type { OrderStageInput } from '@/services/orderStage';

/** Fields allowed by firestore.rules driverClaimAllowedKeys(). */
const DRIVER_CLAIM_ALLOWED_RULE_KEYS = new Set([
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
]);

function buildClaimRequested(driverId: string, vehicle?: string | null) {
  return {
    driverId,
    assignedDriverId: driverId,
    driverName: 'Driver One',
    driverPhone: null as string | null,
    ...(vehicle ? { driverVehicle: vehicle } : {}),
    deliveryStatus: 'driver_assigned',
    status: 'driver_assigned',
    driver: {
      id: driverId,
      name: 'Driver One',
      phone: null,
      vehicle: vehicle ?? null,
      avatar: null,
    },
    acceptedAt: { type: 'timestamp' },
    estimatedDeliveryTime: 18,
    estimatedDeliveryMinutes: 18,
    deliveryPin: '1234',
  };
}

function assertClaimPatchWithinRules(
  label: string,
  current: OrderStageInput & Record<string, unknown>,
  vehicle?: string | null,
) {
  const safe = prepareProtectedOrderPatch(
    current.id ?? 'order1',
    current,
    buildClaimRequested('drv1', vehicle),
    { fileName: 'driverService.ts', functionName: 'claimMarketplaceDriverOrder' },
  );
  const keys = Object.keys(safe);
  const offending = keys.filter((k) => !DRIVER_CLAIM_ALLOWED_RULE_KEYS.has(k));
  expect(offending).toEqual([]);
  expect(keys.length).toBeGreaterThan(0);
  expect(safe.deliveryStatus).toBe('driver_assigned');
  expect(safe.driverId).toBe('drv1');
  expect(safe.assignedDriverId).toBe('drv1');
  expect(safe.updatedBy).toBe('driverService.ts#claimMarketplaceDriverOrder');
  // Document exact payload shape for rules alignment audits.
  if (process.env.LOG_CLAIM_PATCH === '1') {
    // eslint-disable-next-line no-console
    console.log(`[claim patch ${label}]`, keys.sort(), safe);
  }
}

describe('claimMarketplaceDriverOrder patch vs firestore.rules', () => {
  it('payment_confirmed + pending courier (production checkout)', () => {
    assertClaimPatchWithinRules('payment_confirmed_pending', {
      id: 'order1',
      userId: 'cust1',
      customerId: 'cust1',
      restaurantId: 'rest_abc',
      paymentStatus: 'paid',
      deliveryType: 'delivery',
      status: 'payment_confirmed',
      deliveryStatus: 'pending',
      totalPrice: 15,
      total: 15,
      items: [{ id: 'item1', name: 'Burger', price: 12, qty: 1 }],
    });
  });

  it('payment_confirmed + waiting_driver courier (pool legacy)', () => {
    assertClaimPatchWithinRules('payment_confirmed_waiting_driver', {
      id: 'order1',
      userId: 'cust1',
      customerId: 'cust1',
      restaurantId: 'rest_abc',
      paymentStatus: 'paid',
      deliveryType: 'delivery',
      status: 'payment_confirmed',
      deliveryStatus: 'waiting_driver',
      totalPrice: 15,
      total: 15,
      items: [{ id: 'item1', name: 'Burger', price: 12, qty: 1 }],
    });
  });

  it('ready_for_pickup courier before claim', () => {
    assertClaimPatchWithinRules('ready_for_pickup', {
      id: 'order1',
      userId: 'cust1',
      customerId: 'cust1',
      restaurantId: 'rest_abc',
      paymentStatus: 'paid',
      deliveryType: 'delivery',
      status: 'ready_for_pickup',
      deliveryStatus: 'ready_for_pickup',
      totalPrice: 15,
      total: 15,
      items: [{ id: 'item1', name: 'Burger', price: 12, qty: 1 }],
    });
  });

  it('payment_confirmed kitchen + ready_for_pickup courier before claim (split state)', () => {
    assertClaimPatchWithinRules('payment_confirmed_ready_courier', {
      id: 'order1',
      userId: 'cust1',
      customerId: 'cust1',
      restaurantId: 'rest_abc',
      paymentStatus: 'paid',
      deliveryType: 'delivery',
      status: 'payment_confirmed',
      deliveryStatus: 'ready_for_pickup',
      totalPrice: 15,
      total: 15,
      items: [{ id: 'item1', name: 'Burger', price: 12, qty: 1 }],
    });
  });

  it('includes driverVehicle when provided', () => {
    assertClaimPatchWithinRules(
      'with_vehicle',
      {
        id: 'order1',
        userId: 'cust1',
        customerId: 'cust1',
        restaurantId: 'rest_abc',
        paymentStatus: 'paid',
        deliveryType: 'delivery',
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
        totalPrice: 15,
        total: 15,
        items: [{ id: 'item1', name: 'Burger', price: 12, qty: 1 }],
      },
      'Sedan',
    );
  });
});
