import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export type AdminDriverRow = {
  id: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  status: string;
  adminSuspended: boolean;
  deliveriesCompleted: number;
  rating: number | null;
  lastActivityMs: number | null;
};

export function isDriverSuspended(data: Record<string, unknown> | undefined): boolean {
  return data?.adminSuspended === true;
}

export async function setDriverAdminSuspended(
  driverId: string,
  suspended: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'drivers', driverId), {
    adminSuspended: suspended,
    updatedAt: serverTimestamp(),
  });
}

export async function assertDriverCanReceiveDeliveries(
  driverId: string,
): Promise<void> {
  const snap = await getDoc(doc(db, 'drivers', driverId));
  if (!snap.exists()) return;
  if (isDriverSuspended(snap.data() as Record<string, unknown>)) {
    throw new Error('Your driver account is suspended. Contact support.');
  }
}

function driverStatus(data: Record<string, unknown>): string {
  if (data.adminSuspended === true) return 'Suspended';
  const online =
    data.isOnline === true || data.online === true || data.isOnlineLive === true;
  return online ? 'Online' : 'Offline';
}

export function subscribeAdminDrivers(
  onRows: (rows: AdminDriverRow[]) => void,
): Unsubscribe {
  const driverMap = new Map<string, AdminDriverRow>();
  const userEmail = new Map<string, string | null>();
  const deliveryStats = new Map<
    string,
    { completed: number; ratingSum: number; ratingCount: number; lastMs: number | null }
  >();

  const emit = () => {
    const rows = Array.from(driverMap.values()).map((d) => {
      const stats = deliveryStats.get(d.id);
      const rating =
        stats && stats.ratingCount > 0
          ? Number((stats.ratingSum / stats.ratingCount).toFixed(1))
          : null;
      return {
        ...d,
        email: userEmail.get(d.id) ?? d.email,
        deliveriesCompleted: stats?.completed ?? 0,
        rating: rating ?? d.rating,
        lastActivityMs: stats?.lastMs ?? d.lastActivityMs,
      };
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));
    onRows(rows);
  };

  const unsubDrivers = onSnapshot(query(collection(db, 'drivers')), (snap) => {
    driverMap.clear();
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      driverMap.set(d.id, {
        id: d.id,
        name:
          (typeof data.name === 'string' && data.name) ||
          (typeof data.displayName === 'string' && data.displayName) ||
          'Driver',
        email: typeof data.email === 'string' ? data.email : null,
        photoUrl:
          (typeof data.photoURL === 'string' && data.photoURL) ||
          (typeof data.avatarUrl === 'string' && data.avatarUrl) ||
          null,
        status: driverStatus(data),
        adminSuspended: data.adminSuspended === true,
        deliveriesCompleted: 0,
        rating:
          typeof data.rating === 'number' && Number.isFinite(data.rating)
            ? data.rating
            : typeof data.averageRating === 'number'
              ? data.averageRating
              : null,
        lastActivityMs: safeToMillis(data.updatedAt) ?? safeToMillis(data.lastSeenAt),
      });
    });
    emit();
  });

  const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
    userEmail.clear();
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      if (data.role === 'driver' || driverMap.has(d.id)) {
        userEmail.set(
          d.id,
          typeof data.email === 'string' ? data.email : null,
        );
      }
    });
    emit();
  });

  const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
    deliveryStats.clear();
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const driverId =
        (typeof data.driverId === 'string' && data.driverId) ||
        (typeof data.assignedDriverId === 'string' && data.assignedDriverId) ||
        '';
      if (!driverId) return;
      const status = String(data.status ?? '').toLowerCase();
      const delivery = String(data.deliveryStatus ?? '').toLowerCase();
      const completed =
        status.includes('complete') ||
        status.includes('deliver') ||
        delivery.includes('deliver');
      const ts =
        safeToMillis(data.updatedAt) ??
        safeToMillis(data.deliveredAt) ??
        safeToMillis(data.createdAt);
      const prev = deliveryStats.get(driverId) ?? {
        completed: 0,
        ratingSum: 0,
        ratingCount: 0,
        lastMs: null,
      };
      deliveryStats.set(driverId, {
        completed: prev.completed + (completed ? 1 : 0),
        ratingSum: prev.ratingSum,
        ratingCount: prev.ratingCount,
        lastMs:
          ts != null && (prev.lastMs == null || ts > prev.lastMs) ? ts : prev.lastMs,
      });
    });
    emit();
  });

  return () => {
    unsubDrivers();
    unsubUsers();
    unsubOrders();
  };
}
