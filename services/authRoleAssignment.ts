import { USER_ROLE } from '@/constants/roles';
import {
  parseSignupIntent,
  roleForSignupIntent,
  type SignupIntent,
} from '@/lib/authRole';
import { createRestaurant } from '@/services/restaurantService';
import type { UserRole } from '@/services/userService';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import { refreshAuthRoleClaims } from '@/services/authRoleClaims';
import { db } from './firebase';

const LEGACY_CUSTOMER_ROLES = new Set(['customer', '', undefined, null]);

/**
 * Safe migration: missing or legacy `customer` → `user`; `host` → `restaurant`.
 * Never demotes admin / driver / restaurant.
 */
export async function migrateUserRoleIfNeeded(uid: string): Promise<UserRole> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return 'user';

  const data = snap.data() as Record<string, unknown>;
  const raw = data.role;
  const updates: Record<string, unknown> = {};

  if (raw === 'host') {
    updates.role = USER_ROLE.RESTAURANT;
  } else if (
    raw === undefined ||
    raw === null ||
    (typeof raw === 'string' && LEGACY_CUSTOMER_ROLES.has(raw as string))
  ) {
    updates.role = USER_ROLE.USER;
  } else if (raw === 'customer') {
    updates.role = USER_ROLE.USER;
  }

  if (Object.keys(updates).length > 0) {
    await setDoc(userRef, updates, { merge: true });
    return updates.role as UserRole;
  }

  return typeof raw === 'string' ? (raw as UserRole) : 'user';
}

export async function assignUserRole(
  uid: string,
  role: UserRole,
  options?: { restaurantId?: string | null; displayName?: string | null },
): Promise<void> {
  const payload: Record<string, unknown> = {
    role,
    updatedAt: serverTimestamp(),
  };
  if (role === 'restaurant' || role === 'host') {
    payload.restaurantId = options?.restaurantId ?? uid;
  } else if (role === 'driver') {
    payload.restaurantId = null;
    await setDoc(
      doc(db, 'drivers', uid),
      {
        name: options?.displayName?.trim() || 'Driver',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    payload.restaurantId = null;
  }
  await setDoc(doc(db, 'users', uid), payload, { merge: true });
  void refreshAuthRoleClaims();
}

export async function applySignupRole(
  uid: string,
  intent: SignupIntent | string | undefined,
  options?: { displayName?: string | null },
): Promise<UserRole> {
  const parsed = parseSignupIntent(intent);
  const role = roleForSignupIntent(parsed);
  await assignUserRole(uid, role, {
    restaurantId: role === 'restaurant' ? uid : null,
    displayName: options?.displayName,
  });

  if (role === 'restaurant') {
    const restaurantRef = doc(db, 'restaurants', uid);
    const snap = await getDoc(restaurantRef);
    if (!snap.exists()) {
      await createRestaurant({
        userId: uid,
        name: options?.displayName?.trim() || 'My Restaurant',
        logo: null,
        location: '',
      });
    }
  }

  return role;
}
