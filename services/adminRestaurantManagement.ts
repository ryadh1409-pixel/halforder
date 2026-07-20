import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export type AdminRestaurantRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  status: string;
  adminEnabled: boolean;
  completedOrders: number;
  lastActivityMs: number | null;
};

export function isRestaurantEnabledForCustomers(
  data: Record<string, unknown> | undefined,
): boolean {
  if (!data) return false;
  return data.adminEnabled !== false;
}

export async function setRestaurantAdminEnabled(
  restaurantId: string,
  enabled: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'restaurants', restaurantId), {
    adminEnabled: enabled,
    updatedAt: serverTimestamp(),
  });
}

function readRestaurantStatus(data: Record<string, unknown>): string {
  if (data.adminEnabled === false) return 'Disabled';
  if (data.isOpen === false) return 'Closed';
  return 'Active';
}

export function subscribeAdminRestaurants(
  onRows: (rows: AdminRestaurantRow[]) => void,
): Unsubscribe {
  const restaurantMap = new Map<string, AdminRestaurantRow>();
  const orderCounts = new Map<string, { completed: number; lastMs: number | null }>();

  const emit = () => {
    const rows = Array.from(restaurantMap.values()).map((r) => {
      const stats = orderCounts.get(r.id);
      return {
        ...r,
        completedOrders: stats?.completed ?? 0,
        lastActivityMs: stats?.lastMs ?? r.lastActivityMs,
      };
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));
    onRows(rows);
  };

  const unsubRestaurants = onSnapshot(
    collection(db, 'restaurants'),
    (snap) => {
      restaurantMap.clear();
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        restaurantMap.set(d.id, {
          id: d.id,
          name:
            typeof data.name === 'string' && data.name.trim()
              ? data.name.trim()
              : 'Restaurant',
          logoUrl:
            (typeof data.logoUrl === 'string' && data.logoUrl) ||
            (typeof data.logo === 'string' && data.logo) ||
            (typeof data.image === 'string' && data.image) ||
            null,
          status: readRestaurantStatus(data),
          adminEnabled: data.adminEnabled !== false,
          completedOrders: 0,
          lastActivityMs: safeToMillis(data.updatedAt) ?? safeToMillis(data.createdAt),
        });
      });
      emit();
    },
    () => onRows([]),
  );

  const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
    orderCounts.clear();
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const rid =
        (typeof data.restaurantId === 'string' && data.restaurantId) || '';
      if (!rid) return;
      const status = String(data.status ?? '').toLowerCase();
      const delivery = String(data.deliveryStatus ?? '').toLowerCase();
      const completed =
        status.includes('complete') ||
        status.includes('deliver') ||
        delivery.includes('deliver');
      const ts =
        safeToMillis(data.updatedAt) ??
        safeToMillis(data.createdAt) ??
        safeToMillis(data.completedAt);
      const prev = orderCounts.get(rid) ?? { completed: 0, lastMs: null };
      orderCounts.set(rid, {
        completed: prev.completed + (completed ? 1 : 0),
        lastMs:
          ts != null && (prev.lastMs == null || ts > prev.lastMs) ? ts : prev.lastMs,
      });
    });
    emit();
  });

  return () => {
    unsubRestaurants();
    unsubOrders();
  };
}

export async function assertRestaurantAcceptsNewOrders(
  restaurantId: string,
): Promise<void> {
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'restaurants', restaurantId));
  if (!snap.exists()) throw new Error('Restaurant not found.');
  if (!isRestaurantEnabledForCustomers(snap.data() as Record<string, unknown>)) {
    throw new Error('This restaurant is temporarily unavailable.');
  }
}
