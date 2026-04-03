import {
  addDoc,
  collection,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getUserLocation } from './location';

import { registerExpoPushTokenAndSyncToFirestore } from '@/services/pushNotifications';
import { db } from './firebase';

/**
 * Updates lastActive timestamp when the app launches.
 * Used for inactive user reminder (don't remind users who opened app in last 48h).
 */
export async function updateLastActive(uid: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      lastActive: serverTimestamp(),
    });
  } catch {
    // ignore
  }
}

/**
 * Saves user's latitude/longitude to Firestore under users/{userId}
 * and appends a point to user_activity for the admin activity map.
 */
export async function updateUserLocationInFirestore(
  uid: string,
  userEmail?: string | null,
): Promise<void> {
  try {
    const { latitude, longitude } = await getUserLocation();
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      latitude,
      longitude,
      location: { latitude, longitude },
      lastLatitude: latitude,
      lastLongitude: longitude,
      lastLocationUpdatedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    });
    await addDoc(collection(db, 'user_activity'), {
      userId: uid,
      userEmail: userEmail ?? '',
      latitude,
      longitude,
      time: serverTimestamp(),
    });
  } catch {
    // Permission denied or location unavailable - skip
  }
}

/**
 * @deprecated Prefer `registerExpoPushTokenAndSyncToFirestore` from `@/services/pushNotifications` (used from Auth on login).
 */
export async function registerPushTokenAndSave(uid: string): Promise<void> {
  try {
    await registerExpoPushTokenAndSyncToFirestore(uid);
  } catch {
    // Ignore push registration errors
  }
}
