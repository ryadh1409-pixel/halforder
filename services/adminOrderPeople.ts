/**
 * Admin Order Details — resolve Customer / Restaurant / Driver contact cards
 * from order IDs using existing Firestore documents (users, restaurants, drivers).
 */
import {
  resolveRestaurantDisplayName,
  resolveRestaurantPhoneNumber,
} from '@/lib/restaurantDashboardProfile';
import { db } from '@/services/firebase';
import { fetchPaymentCustomerProfile } from '@/services/paymentDetailSupport';
import { doc, getDoc } from 'firebase/firestore';

export type AdminOrderPersonInfo = {
  id: string | null;
  assigned: boolean;
  name: string;
  phone: string | null;
  email: string | null;
};

export type AdminOrderPeople = {
  customer: AdminOrderPersonInfo;
  restaurant: AdminOrderPersonInfo;
  driver: AdminOrderPersonInfo;
};

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function nest(
  data: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const v = data[key];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

/** IDs already stored on the order document (schema-tolerant). */
export function extractOrderPeopleIds(order: Record<string, unknown>): {
  customerId: string | null;
  restaurantId: string | null;
  driverId: string | null;
} {
  const customer = nest(order, 'customer');
  const restaurant = nest(order, 'restaurant');
  const driver = nest(order, 'driver');

  return {
    customerId: pickString(
      order.customerId,
      order.userId,
      customer?.id,
      customer?.uid,
      order.createdBy,
      order.hostId,
      order.creatorId,
    ),
    restaurantId: pickString(
      order.restaurantId,
      order.venueId,
      restaurant?.id,
      restaurant?.uid,
    ),
    driverId: pickString(
      order.driverId,
      order.assignedDriverId,
      driver?.id,
      driver?.uid,
    ),
  };
}

function emptyPerson(
  overrides: Partial<AdminOrderPersonInfo> = {},
): AdminOrderPersonInfo {
  return {
    id: null,
    assigned: false,
    name: '—',
    phone: null,
    email: null,
    ...overrides,
  };
}

async function readUserContact(uid: string): Promise<{
  name: string | null;
  phone: string | null;
  email: string | null;
}> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) {
      return { name: null, phone: null, email: null };
    }
    const data = snap.data() as Record<string, unknown>;
    return {
      name: pickString(data.displayName, data.name, data.fullName),
      phone: pickString(data.phoneNumber, data.phone, data.mobile, data.whatsapp),
      email: pickString(data.email),
    };
  } catch {
    return { name: null, phone: null, email: null };
  }
}

async function fetchRestaurantPerson(
  restaurantId: string,
  orderFallbackName: string | null,
): Promise<AdminOrderPersonInfo> {
  let restaurantData: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(doc(db, 'restaurants', restaurantId));
    if (snap.exists()) {
      restaurantData = snap.data() as Record<string, unknown>;
    }
  } catch {
    restaurantData = null;
  }

  const ownerId = pickString(restaurantData?.ownerId) ?? restaurantId;
  const [restaurantUser, ownerUser] = await Promise.all([
    readUserContact(restaurantId),
    ownerId !== restaurantId ? readUserContact(ownerId) : Promise.resolve(null),
  ]);

  const resolvedName = resolveRestaurantDisplayName(restaurantData);
  const name =
    resolvedName !== 'Restaurant'
      ? resolvedName
      : pickString(orderFallbackName, restaurantUser.name, ownerUser?.name) ??
        'Restaurant';

  const phone =
    resolveRestaurantPhoneNumber(restaurantData, {
      phoneNumber: restaurantUser.phone,
      phone: restaurantUser.phone,
    }) ??
    ownerUser?.phone ??
    null;

  const email =
    pickString(
      restaurantData?.email,
      restaurantData?.contactEmail,
      restaurantUser.email,
      ownerUser?.email,
    ) ?? null;

  return {
    id: restaurantId,
    assigned: true,
    name,
    phone,
    email,
  };
}

async function fetchDriverPerson(
  driverId: string,
  order: Record<string, unknown>,
): Promise<AdminOrderPersonInfo> {
  const driverNest = nest(order, 'driver');
  let driverData: Record<string, unknown> | null = null;
  try {
    const snap = await getDoc(doc(db, 'drivers', driverId));
    if (snap.exists()) {
      driverData = snap.data() as Record<string, unknown>;
    }
  } catch {
    driverData = null;
  }

  const user = await readUserContact(driverId);

  const name =
    pickString(
      driverData?.name,
      driverData?.displayName,
      user.name,
      order.driverName,
      driverNest?.name,
      driverNest?.displayName,
    ) ?? 'Driver';

  const phone =
    pickString(
      driverData?.phone,
      driverData?.phoneNumber,
      user.phone,
      order.driverPhone,
      driverNest?.phone,
      driverNest?.phoneNumber,
    ) ?? null;

  const email =
    pickString(driverData?.email, user.email, driverNest?.email) ?? null;

  return {
    id: driverId,
    assigned: true,
    name,
    phone,
    email,
  };
}

/**
 * Load Customer / Restaurant / Driver contact info for Admin Order Details.
 * Uses order IDs + existing users / restaurants / drivers docs.
 */
export async function fetchAdminOrderPeople(
  order: Record<string, unknown>,
): Promise<AdminOrderPeople> {
  const ids = extractOrderPeopleIds(order);
  const customerNest = nest(order, 'customer');
  const restaurantNest = nest(order, 'restaurant');

  const [customerProfile, restaurant, driver] = await Promise.all([
    ids.customerId
      ? fetchPaymentCustomerProfile(ids.customerId)
      : Promise.resolve(null),
    ids.restaurantId
      ? fetchRestaurantPerson(
          ids.restaurantId,
          pickString(order.restaurantName, restaurantNest?.name),
        )
      : Promise.resolve(
          emptyPerson({
            name: pickString(order.restaurantName, restaurantNest?.name) ?? '—',
          }),
        ),
    ids.driverId
      ? fetchDriverPerson(ids.driverId, order)
      : Promise.resolve(
          emptyPerson({
            assigned: false,
            name: 'Not Assigned',
          }),
        ),
  ]);

  const customer: AdminOrderPersonInfo = customerProfile
    ? {
        id: customerProfile.uid || ids.customerId,
        assigned: true,
        name:
          pickString(
            customerProfile.name,
            order.customerName,
            customerNest?.name,
            customerNest?.displayName,
          ) ?? '—',
        phone:
          pickString(
            customerProfile.phone,
            order.customerPhone,
            customerNest?.phone,
            customerNest?.phoneNumber,
          ) ?? null,
        email: pickString(customerProfile.email, customerNest?.email) ?? null,
      }
    : emptyPerson({
        id: ids.customerId,
        assigned: Boolean(ids.customerId),
        name:
          pickString(
            order.customerName,
            customerNest?.name,
            customerNest?.displayName,
          ) ?? '—',
        phone:
          pickString(
            order.customerPhone,
            customerNest?.phone,
            customerNest?.phoneNumber,
          ) ?? null,
        email: pickString(customerNest?.email) ?? null,
      });

  return { customer, restaurant, driver };
}
