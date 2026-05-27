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
import { logFirestoreUncaught } from './firestoreQueryDiagnostics';

const LEGACY_CUSTOMER_ROLES = new Set(['customer', '', undefined, null]);

/**
 * Safe migration: missing or legacy `customer` → `user`; `host` → `restaurant`.
 * Never demotes admin / driver / restaurant.
 */
export async function migrateUserRoleIfNeeded(uid: string): Promise<UserRole> {
  const userRef = doc(db, 'users', uid);
  let snap;
  try {
    console.log('[PRE FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'getDoc(role migration)',
    });
    snap = await getDoc(userRef);
    console.log('[POST FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'getDoc(role migration)',
    });
  } catch (error) {
    console.error('[FAILED FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'getDoc(role migration)',
      error,
    });
    logFirestoreUncaught(`users/${uid}`, 'getDoc(role migration)', error);
    throw error;
  }
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
    try {
      console.log('[PRE FIRESTORE]', {
        path: `users/${uid}`,
        operation: 'setDoc(merge role migration)',
      });
      await setDoc(userRef, updates, { merge: true });
      console.log('[POST FIRESTORE]', {
        path: `users/${uid}`,
        operation: 'setDoc(merge role migration)',
      });
    } catch (error) {
      console.error('[FAILED FIRESTORE]', {
        path: `users/${uid}`,
        operation: 'setDoc(merge role migration)',
        error,
      });
      logFirestoreUncaught(`users/${uid}`, 'setDoc(merge role migration)', error);
      throw error;
    }
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
    try {
      console.log('[PRE FIRESTORE]', {
        path: `drivers/${uid}`,
        operation: 'setDoc(merge)',
      });
      await setDoc(
        doc(db, 'drivers', uid),
        {
          name: options?.displayName?.trim() || 'Driver',
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      console.log('[POST FIRESTORE]', {
        path: `drivers/${uid}`,
        operation: 'setDoc(merge)',
      });
    } catch (error) {
      console.error('[FAILED FIRESTORE]', {
        path: `drivers/${uid}`,
        operation: 'setDoc(merge)',
        error,
      });
      logFirestoreUncaught(`drivers/${uid}`, 'setDoc(merge)', error);
      throw error;
    }
  } else {
    payload.restaurantId = null;
  }
  try {
    console.log('[PRE FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'setDoc(merge assign role)',
    });
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
    console.log('[POST FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'setDoc(merge assign role)',
    });
  } catch (error) {
    console.error('[FAILED FIRESTORE]', {
      path: `users/${uid}`,
      operation: 'setDoc(merge assign role)',
      error,
    });
    logFirestoreUncaught(`users/${uid}`, 'setDoc(merge assign role)', error);
    throw error;
  }
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
    let snap;
    try {
      console.log('[PRE FIRESTORE]', {
        path: `restaurants/${uid}`,
        operation: 'getDoc(role apply)',
      });
      snap = await getDoc(restaurantRef);
      console.log('[POST FIRESTORE]', {
        path: `restaurants/${uid}`,
        operation: 'getDoc(role apply)',
      });
    } catch (error) {
      console.error('[FAILED FIRESTORE]', {
        path: `restaurants/${uid}`,
        operation: 'getDoc(role apply)',
        error,
      });
      logFirestoreUncaught(`restaurants/${uid}`, 'getDoc(role apply)', error);
      throw error;
    }
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
