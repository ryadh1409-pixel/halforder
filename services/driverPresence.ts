import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db, syncAuthForFirestoreReads } from './firebase';

export const DRIVER_PRESENCE_COLLECTION = 'drivers';

export function driverPresenceDoc(driverId: string) {
  return doc(db, DRIVER_PRESENCE_COLLECTION, driverId.trim());
}

/** Normalize Firestore / legacy values to a strict boolean. */
export function coerceDriverOnlineFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    return false;
  }
  return false;
}

function readDriverPresenceField(data: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(data, key)) {
    return data[key];
  }
  const alt = Object.keys(data).find((k) => k.toLowerCase() === key.toLowerCase());
  return alt ? data[alt] : undefined;
}

/**
 * True when any canonical presence flag is explicitly online.
 */
export function resolveDriverOnline(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const online = coerceDriverOnlineFlag(readDriverPresenceField(data, 'online'));
  const isOnline = coerceDriverOnlineFlag(readDriverPresenceField(data, 'isOnline'));
  const isOnlineLive = coerceDriverOnlineFlag(readDriverPresenceField(data, 'isOnlineLive'));
  return online === true || isOnline === true || isOnlineLive === true;
}

/** Logs presence fields in dev when values change. */
export function logDriverPresenceRead(
  path: string,
  data: Record<string, unknown> | undefined,
  resolved: boolean,
): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log('[ONLINE READ]', {
    path,
    online: data?.online,
    isOnline: data?.isOnline,
    isOnlineLive: data?.isOnlineLive,
    resolved,
  });
}

/**
 * Writes driver online status to `drivers/{auth.uid}` (canonical presence doc).
 */
export async function updateDriverOnlineStatus(
  driverId: string,
  nextValue: boolean,
): Promise<void> {
  const uid = driverId?.trim();
  if (!uid) {
    throw new Error('updateDriverOnlineStatus: missing driver id');
  }

  await syncAuthForFirestoreReads();
  const currentUid = auth.currentUser?.uid;
  if (!currentUid || currentUid !== uid) {
    throw new Error('updateDriverOnlineStatus: signed-in user does not match driver id');
  }

  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[ONLINE WRITE START]', { uid, nextValue });
  }

  try {
    const ref = driverPresenceDoc(uid);
    const ts = serverTimestamp();
    await setDoc(
      ref,
      {
        online: nextValue,
        isOnline: nextValue,
        isOnlineLive: nextValue,
        updatedAt: ts,
        lastActive: ts,
        lastSeenAt: ts,
      },
      { merge: true },
    );
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[ONLINE WRITE SUCCESS]', { uid, nextValue });
    }
  } catch (error) {
    console.error('[ONLINE WRITE ERROR]', error);
    throw error;
  }
}

/** Ensures `drivers/{uid}` exists without forcing offline when already present. */
export async function ensureDriverPresenceDoc(
  driverId: string,
  displayName?: string | null,
): Promise<void> {
  const uid = driverId?.trim();
  if (!uid) return;

  const ref = driverPresenceDoc(uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    if (displayName?.trim()) {
      await setDoc(ref, { name: displayName.trim() }, { merge: true });
    }
    return;
  }

  await setDoc(
    ref,
    {
      name: displayName?.trim() || 'Driver',
      online: false,
      isOnline: false,
      isOnlineLive: false,
      updatedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    },
    { merge: true },
  );
}
