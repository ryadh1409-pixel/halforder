/**
 * Admin AI search helpers — reuse collections admins already can read.
 * Never returns secrets, tokens, or payment credentials.
 */
import { adminRoutes } from '@/constants/adminRoutes';
import { db } from '@/services/firebase';
import type { AdminAiEntityCard } from '@/types/adminAiAssistant';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function includesCI(hay: string | null | undefined, needle: string): boolean {
  if (!hay) return false;
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function digitsOnly(v: string): string {
  return v.replace(/\D/g, '');
}

export async function searchAdminUsers(queryText: string): Promise<AdminAiEntityCard[]> {
  const q = queryText.trim();
  if (!q) return [];
  const snap = await getDocs(
    query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(400)),
  );
  const phoneNeedle = digitsOnly(q);
  const out: AdminAiEntityCard[] = [];

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const name =
      asString(data.displayName) || asString(data.name) || 'Unknown user';
    const email = asString(data.email);
    const phone =
      asString(data.phoneNumber) ||
      asString(data.phone) ||
      asString(data.whatsappPhone);
    const role = asString(data.role) || 'user';
    const banned = data.banned === true;
    const photoUrl =
      asString(data.photoURL) ||
      asString(data.avatarUrl) ||
      asString(data.photoUrl);

    const match =
      d.id === q ||
      includesCI(name, q) ||
      includesCI(email, q) ||
      (phoneNeedle.length >= 4 &&
        digitsOnly(phone ?? '').includes(phoneNeedle)) ||
      includesCI(phone, q);

    if (!match) continue;

    out.push({
      id: d.id,
      kind: 'user',
      title: name,
      subtitle: email ?? d.id,
      photoUrl,
      meta: [
        `Role: ${role}`,
        `Status: ${banned ? 'Banned' : 'Active'}`,
        phone ? `Phone: ${phone}` : 'Phone: —',
        `UID: ${d.id.slice(0, 10)}…`,
      ],
      href: adminRoutes.user(d.id),
    });
    if (out.length >= 8) break;
  }
  return out;
}

export async function searchAdminDrivers(queryText: string): Promise<AdminAiEntityCard[]> {
  const q = queryText.trim();
  const snap = await getDocs(collection(db, 'drivers'));
  const out: AdminAiEntityCard[] = [];

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const name =
      asString(data.displayName) ||
      asString(data.name) ||
      asString(data.fullName) ||
      'Driver';
    const email = asString(data.email);
    const status =
      data.adminSuspended === true
        ? 'Suspended'
        : data.isOnline === true || data.online === true
          ? 'Online'
          : 'Offline';
    const photoUrl =
      asString(data.photoURL) ||
      asString(data.photoUrl) ||
      asString(data.avatarUrl);

    if (q && !(includesCI(name, q) || includesCI(email, q) || d.id === q || includesCI(d.id, q))) {
      continue;
    }

    out.push({
      id: d.id,
      kind: 'driver',
      title: name,
      subtitle: email ?? `Driver · ${status}`,
      photoUrl,
      meta: [`Status: ${status}`, `ID: ${d.id.slice(0, 10)}…`],
      href: adminRoutes.driverManagement,
    });
    if (out.length >= 8) break;
  }

  if (!q) return out.slice(0, 8);
  return out;
}

export async function searchAdminRestaurants(
  queryText: string,
): Promise<AdminAiEntityCard[]> {
  const q = queryText.trim();
  const snap = await getDocs(collection(db, 'restaurants'));
  const out: AdminAiEntityCard[] = [];

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const name = asString(data.name) || 'Restaurant';
    const enabled = data.adminEnabled !== false;
    const status = !enabled ? 'Disabled' : data.isOpen === false ? 'Closed' : 'Active';
    const photoUrl =
      asString(data.logoUrl) || asString(data.logo) || asString(data.image);

    if (q && !(includesCI(name, q) || d.id === q || includesCI(d.id, q))) {
      continue;
    }

    out.push({
      id: d.id,
      kind: 'restaurant',
      title: name,
      subtitle: status,
      photoUrl,
      meta: [
        `Admin enabled: ${enabled ? 'Yes' : 'No'}`,
        `ID: ${d.id.slice(0, 10)}…`,
      ],
      href: adminRoutes.restaurantManagement,
    });
    if (out.length >= 8) break;
  }
  return out;
}

export async function searchAdminOrders(queryText: string | null): Promise<{
  entities: AdminAiEntityCard[];
  detail: string | null;
}> {
  const q = (queryText ?? '').trim().replace(/^#/, '');
  if (!q) {
    return { entities: [], detail: null };
  }

  // Exact doc first
  try {
    const exact = await getDoc(doc(db, 'orders', q));
    if (exact.exists()) {
      const data = exact.data() as Record<string, unknown>;
      return {
        entities: [mapOrderEntity(exact.id, data)],
        detail: describeOrderOps(exact.id, data),
      };
    }
  } catch {
    /* continue with scan */
  }

  const snap = await getDocs(
    query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(250)),
  );
  const entities: AdminAiEntityCard[] = [];
  let detail: string | null = null;

  for (const d of snap.docs) {
    if (!d.id.toLowerCase().includes(q.toLowerCase())) continue;
    const data = d.data() as Record<string, unknown>;
    entities.push(mapOrderEntity(d.id, data));
    if (!detail) detail = describeOrderOps(d.id, data);
    if (entities.length >= 6) break;
  }

  return { entities, detail };
}

function mapOrderEntity(
  id: string,
  data: Record<string, unknown>,
): AdminAiEntityCard {
  const status = asString(data.status) || 'unknown';
  const restaurant =
    asString(data.restaurantName) || asString(data.storeName) || null;
  const payment =
    asString(data.paymentStatus) ||
    asString(data.payment_state) ||
    null;
  return {
    id,
    kind: 'order',
    title: restaurant ? `${restaurant}` : `Order ${id.slice(0, 8)}…`,
    subtitle: `Status: ${status}`,
    meta: [
      payment ? `Payment: ${payment}` : 'Payment: —',
      `Order ID: ${id}`,
    ],
    href: adminRoutes.order(id),
  };
}

function describeOrderOps(id: string, data: Record<string, unknown>): string {
  const status = asString(data.status) || 'unknown';
  const payment =
    asString(data.paymentStatus) || asString(data.payment_state) || 'unknown';
  const driverId = asString(data.driverId);
  const restaurantAccepted =
    data.restaurantAccepted === true ||
    status === 'preparing' ||
    status === 'ready' ||
    status === 'out_for_delivery' ||
    status === 'completed';
  const paid =
    String(payment).toLowerCase() === 'paid' ||
    String(payment).toLowerCase() === 'succeeded';
  const onTheWay =
    status === 'out_for_delivery' ||
    status === 'picked_up' ||
    status === 'delivering';
  const finished = status === 'completed' || status === 'delivered';
  const eta =
    asString(data.estimatedDeliveryTime) ||
    asString(data.eta) ||
    (typeof data.estimatedDeliveryTime === 'number'
      ? `${data.estimatedDeliveryTime} min`
      : null);

  return [
    `Order ${id}`,
    `• Status: ${status}`,
    `• Customer paid: ${paid ? 'Yes' : `No (${payment})`}`,
    `• Restaurant accepted: ${restaurantAccepted ? 'Yes / in progress' : 'Not confirmed from status'}`,
    `• Driver assigned: ${driverId ? driverId.slice(0, 10) + '…' : 'No'}`,
    `• Driver on the way: ${onTheWay ? 'Yes' : 'No'}`,
    `• Delivery finished: ${finished ? 'Yes' : 'No'}`,
    `• ETA: ${eta ?? 'Not available'}`,
  ].join('\n');
}

export async function countDocsCreatedToday(
  collectionName: string,
  roleFilter?: string,
): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const snap = await getDocs(collection(db, collectionName));
  let n = 0;
  snap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (roleFilter) {
      const role = asString(data.role);
      if (role !== roleFilter) return;
    }
    const ms = safeToMillis(data.createdAt);
    if (ms != null && ms >= startMs) n += 1;
  });
  return n;
}
