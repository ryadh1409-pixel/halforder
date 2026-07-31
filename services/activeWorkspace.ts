/**
 * Active workspace preference — navigation only.
 * Does not write Firestore roles or delete driver/restaurant profiles.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';

export type ActiveWorkspace = 'user' | 'driver' | 'restaurant';

const keyFor = (uid: string) => `@ourfood/active_workspace_v1:${uid}`;

export async function getActiveWorkspace(
  uid: string,
): Promise<ActiveWorkspace | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(uid));
    if (raw === 'user' || raw === 'driver' || raw === 'restaurant') return raw;
    return null;
  } catch {
    return null;
  }
}

export async function setActiveWorkspace(
  uid: string,
  workspace: ActiveWorkspace,
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(uid), workspace);
  } catch {
    /* best-effort */
  }
}

export async function clearActiveWorkspace(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(uid));
  } catch {
    /* ignore */
  }
}

/** Workspaces the user can open without changing Firestore role. */
export async function loadAvailableWorkspaces(
  uid: string,
  firestoreRole: string | null | undefined,
): Promise<ActiveWorkspace[]> {
  const set = new Set<ActiveWorkspace>(['user']);
  const role = typeof firestoreRole === 'string' ? firestoreRole : '';
  if (role === 'driver') set.add('driver');
  if (role === 'restaurant' || role === 'host') set.add('restaurant');

  try {
    const [driverSnap, restaurantSnap] = await Promise.all([
      getDoc(doc(db, 'drivers', uid)),
      getDoc(doc(db, 'restaurants', uid)),
    ]);
    if (driverSnap.exists()) set.add('driver');
    if (restaurantSnap.exists()) set.add('restaurant');
  } catch {
    /* keep role-derived set */
  }

  const order: ActiveWorkspace[] = ['user', 'driver', 'restaurant'];
  return order.filter((w) => set.has(w));
}

/**
 * Primary shell from Firestore role — source of truth after admin approval.
 * Partner roles always map to their own workspace (not customer).
 */
export function primaryWorkspaceForRole(
  firestoreRole: string | null | undefined,
): ActiveWorkspace {
  if (firestoreRole === 'driver') return 'driver';
  if (firestoreRole === 'restaurant' || firestoreRole === 'host') {
    return 'restaurant';
  }
  return 'user';
}

/**
 * Routing workspace for shells.
 * Prefer an explicit active workspace when set (mid-session switcher).
 * Hydrate is responsible for never latching a stale pre-approval `user`
 * when Firestore role is driver/restaurant.
 */
export function resolveRoutingWorkspace(
  firestoreRole: string | null | undefined,
  activeWorkspace: ActiveWorkspace | null,
): ActiveWorkspace {
  if (activeWorkspace) return activeWorkspace;
  return primaryWorkspaceForRole(firestoreRole);
}
