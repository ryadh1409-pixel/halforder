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

function readDriverPresenceField(
  data: Record<string, unknown>,
  key: 'isOnline' | 'online',
): unknown {
  if (Object.prototype.hasOwnProperty.call(data, key)) {
    return data[key];
  }
  const alt = Object.keys(data).find((k) => k.toLowerCase() === key.toLowerCase());
  return alt ? data[alt] : undefined;
}

/**
 * True only when either presence flag is explicitly online.
 * Document existence alone is not enough (offline drivers still have a doc).
 */
export function resolveDriverOnline(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const isOnline = coerceDriverOnlineFlag(readDriverPresenceField(data, 'isOnline'));
  const online = coerceDriverOnlineFlag(readDriverPresenceField(data, 'online'));
  return isOnline || online;
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

  const path = `${DRIVER_PRESENCE_COLLECTION}/${uid}`;
  // eslint-disable-next-line no-console
  console.log('[ONLINE WRITE START]', { uid, nextValue, path });

  try {
    const ref = driverPresenceDoc(uid);
    const ts = serverTimestamp();
    await setDoc(
      ref,
      {
        online: nextValue,
        isOnline: nextValue,
        updatedAt: ts,
        lastActive: ts,
        lastSeenAt: ts,
      },
      { merge: true },
    );
    // eslint-disable-next-line no-console
    console.log('[ONLINE WRITE SUCCESS]', { uid, nextValue, path });
  } catch (error) {
    console.error('[ONLINE WRITE ERROR]', { uid, nextValue, path, error });
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
      updatedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    },
    { merge: true },
  );
}
