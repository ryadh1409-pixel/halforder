import { db } from '@/services/firebase';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

export type RestaurantProfile = {
  id: string;
  name: string;
  logo: string | null;
  location: string;
  ownerId: string;
  type: 'restaurant' | 'food_truck';
  profileCompleted: boolean;
  description: string;
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
    location: typeof data.location === 'string' ? data.location : '',
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : userId,
    type: data.type === 'food_truck' ? 'food_truck' : 'restaurant',
    profileCompleted: data.profileCompleted === true,
    description: typeof data.description === 'string' ? data.description : '',
  };
}

export async function createRestaurant(data: {
  userId: string;
  name: string;
  logo: string | null;
  location: string;
  type?: 'restaurant' | 'food_truck';
  profileCompleted?: boolean;
  description?: string;
}): Promise<void> {
  await setDoc(
    doc(db, 'restaurants', data.userId),
    {
      name: data.name.trim(),
      logo: data.logo ?? null,
      location: data.location.trim(),
      ownerId: data.userId,
      isOpen: true,
      type: data.type ?? 'restaurant',
      description: data.description?.trim() ?? '',
      profileCompleted: data.profileCompleted ?? false,
      createdAt: serverTimestamp(),
    },
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
