import { parseSavedLocation, savedLocationToFirestore } from '@/lib/location/parseSavedLocation';
import type { SavedLocation } from '@/types/savedLocation';
import { db } from './firebase';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

function restaurantLocationLabel(data: Record<string, unknown>): string {
  const parsed = parseSavedLocation(data.location);
  if (parsed) return parsed.address;
  return typeof data.location === 'string' ? data.location : '';
}

export type RestaurantProfile = {
  id: string;
  name: string;
  logo: string | null;
  /** Display address (from `location` map or legacy string). */
  location: string;
  savedLocation: SavedLocation | null;
  ownerId: string;
  type: 'restaurant' | 'food_truck';
  profileCompleted: boolean;
  description: string;
  stripeAccountId?: string | null;
  stripeConnected?: boolean;
  stripeChargesEnabled?: boolean;
  stripeDetailsSubmitted?: boolean;
  stripeReady?: boolean;
};

export async function getRestaurant(
  userId: string,
): Promise<RestaurantProfile | null> {
  const ref = doc(db, 'restaurants', userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    id: userId,
    name: typeof data.name === 'string' ? data.name : '',
    logo: typeof data.logo === 'string' ? data.logo : null,
    location: restaurantLocationLabel(data),
    savedLocation: parseSavedLocation(data.location),
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : userId,
    type: data.type === 'food_truck' ? 'food_truck' : 'restaurant',
    profileCompleted: data.profileCompleted === true,
    description: typeof data.description === 'string' ? data.description : '',
    stripeAccountId:
      typeof data.stripeAccountId === 'string' ? data.stripeAccountId : null,
    stripeConnected: data.stripeConnected === true,
    stripeChargesEnabled: data.stripeChargesEnabled === true,
    stripeDetailsSubmitted: data.stripeDetailsSubmitted === true,
    stripeReady: data.stripeReady === true,
  };
}

export async function createRestaurant(data: {
  userId: string;
  name: string;
  logo: string | null;
  /** Legacy string address when `savedLocation` is omitted. */
  location?: string;
  savedLocation?: SavedLocation | null;
  type?: 'restaurant' | 'food_truck';
  profileCompleted?: boolean;
  description?: string;
}): Promise<void> {
  const saved = data.savedLocation ?? null;
  const legacyLocation = data.location?.trim() ?? saved?.address?.trim() ?? '';
  const locationPayload = saved
    ? savedLocationToFirestore(saved)
    : legacyLocation;

  const payload: Record<string, unknown> = {
    id: data.userId,
    name: data.name.trim(),
    logo: data.logo ?? null,
    location: locationPayload,
    ownerId: data.userId,
    isOpen: true,
    type: data.type ?? 'restaurant',
    description: data.description?.trim() ?? '',
    profileCompleted: data.profileCompleted ?? false,
    stripeReady: false,
    stripeAccountId: null,
    createdAt: serverTimestamp(),
  };

  if (saved) {
    payload.latitude = saved.latitude;
    payload.longitude = saved.longitude;
    payload.address = saved.address;
  }

  await setDoc(
    doc(db, 'restaurants', data.userId),
    payload,
    { merge: true },
  );
  await updateDoc(doc(db, 'users', data.userId), { restaurantId: data.userId });
}

export async function updateRestaurant(
  userId: string,
  updates: Partial<
    Pick<RestaurantProfile, 'name' | 'logo' | 'location' | 'type' | 'profileCompleted' | 'description'>
  >,
): Promise<void> {
  await updateDoc(doc(db, 'restaurants', userId), updates);
}
