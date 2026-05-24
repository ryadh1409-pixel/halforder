/**
 * Canonical Firestore persistence for restaurant venue open/closed (`restaurants/{id}.isOpen`).
 */
import { logVenueStatusError } from '@/lib/restaurantVenueStatus';
import { auth, db } from '@/services/firebase';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentReference,
} from 'firebase/firestore';

/** Single Firestore field — reads and writes must use this only. */
export const RESTAURANT_IS_OPEN_FIELD = 'isOpen' as const;

function restaurantRef(restaurantId: string): DocumentReference {
  return doc(db, 'restaurants', restaurantId.trim());
}

function assertOwnerWrite(restaurantId: string): void {
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) {
    throw new Error('Not signed in — cannot update venue status.');
  }
  if (uid !== restaurantId.trim()) {
    throw new Error(
      `Venue write blocked: auth uid (${uid}) does not match restaurants/${restaurantId}`,
    );
  }
}

/**
 * Persist venue availability to `restaurants/{restaurantId}.isOpen`.
 * Confirmation is handled by the snapshot listener (post-write), not an immediate server read.
 */
export async function persistRestaurantIsOpen(
  restaurantId: string,
  isOpen: boolean,
): Promise<void> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error('Invalid restaurant id');

  assertOwnerWrite(rid);

  const ref = restaurantRef(rid);
  const nextOpen = isOpen === true;
  const payload = {
    [RESTAURANT_IS_OPEN_FIELD]: nextOpen,
    ownerId: rid,
    updatedAt: serverTimestamp(),
  };

  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(
        ref,
        {
          ...payload,
          name: 'My Restaurant',
          location: '',
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    logVenueStatusError('write-failure', {
      path: `restaurants/${rid}`,
      isOpen: nextOpen,
      error: error instanceof Error ? error.message : String(error),
      code:
        typeof error === 'object' && error !== null && 'code' in error
          ? (error as { code: string }).code
          : undefined,
    });
    throw error;
  }
}
