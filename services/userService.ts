import { db } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export type UserRole = 'user' | 'driver' | 'restaurant' | 'admin' | 'host';

export type UserProfileDoc = {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  restaurantId?: string;
};

function normalizeRole(value: unknown): UserRole {
  if (value === 'driver' || value === 'restaurant' || value === 'admin' || value === 'host') {
    return value;
  }
  return 'user';
}

export async function getUserRole(uid: string): Promise<UserRole> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return 'user';
  return normalizeRole(snap.data()?.role);
}

export function subscribeUserRole(
  uid: string,
  onRole: (role: UserRole) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        onRole('user');
        return;
      }
      onRole(normalizeRole(snap.data()?.role));
    },
    () => {
      onError?.();
    },
  );
}

export function subscribeUsersForAdmin(
  onRows: (rows: UserProfileDoc[]) => void,
  onError?: () => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'users'), orderBy('createdAt', 'desc')),
    (snap) => {
      const rows: UserProfileDoc[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name:
            (typeof data.name === 'string' && data.name.trim()) ||
            (typeof data.displayName === 'string' && data.displayName.trim()) ||
            'Unknown user',
          email: typeof data.email === 'string' ? data.email : null,
          role: normalizeRole(data.role),
          restaurantId:
            typeof data.restaurantId === 'string' ? data.restaurantId : undefined,
        };
      });
      onRows(rows);
    },
    () => onError?.(),
  );
}

export async function updateUserRoleByAdmin(
  uid: string,
  role: UserRole,
  restaurantId?: string | null,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    role,
    restaurantId: restaurantId ?? null,
  });
}

export async function getUsers(): Promise<UserProfileDoc[]> {
  const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name:
        (typeof data.name === 'string' && data.name.trim()) ||
        (typeof data.displayName === 'string' && data.displayName.trim()) ||
        'Unknown user',
      email: typeof data.email === 'string' ? data.email : null,
      role: normalizeRole(data.role),
      restaurantId: typeof data.restaurantId === 'string' ? data.restaurantId : undefined,
    };
  });
}

export async function updateUserRole(uid: string, role: UserRole): Promise<void> {
  await updateUserRoleByAdmin(uid, role);
}
