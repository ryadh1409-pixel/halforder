import { db } from './firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

export type FoodItem = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  restaurantId: string;
  available: boolean;
  description: string;
  category: string;
};

export async function addFoodItem(payload: {
  name: string;
  price: number;
  image: string | null;
  restaurantId: string;
  available: boolean;
  description: string;
  category: string;
}): Promise<void> {
  await addDoc(collection(db, 'restaurants', payload.restaurantId, 'menuItems'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
}

export function getFoodItems(
  restaurantId: string,
  onData: (items: FoodItem[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'restaurants', restaurantId, 'menuItems'),
      orderBy('createdAt', 'desc'),
    ),
    (snap) => {
      try {
        onData(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: typeof data.name === 'string' ? data.name : 'Food item',
              price: typeof data.price === 'number' ? data.price : 0,
              image: typeof data.image === 'string' ? data.image : null,
              restaurantId,
              available: data.available !== false,
              description:
                typeof data.description === 'string' ? data.description : '',
              category: typeof data.category === 'string' ? data.category : '',
            };
          }),
        );
      } catch (e) {
        console.error('[getFoodItems]', e);
        onData([]);
      }
    },
    () => onData([]),
  );
}

export async function updateFoodItem(
  restaurantId: string,
  itemId: string,
  updates: Partial<
    Pick<FoodItem, 'name' | 'price' | 'image' | 'available' | 'description' | 'category'>
  >,
): Promise<void> {
  await updateDoc(doc(db, 'restaurants', restaurantId, 'menuItems', itemId), updates);
}

export async function deleteFoodItem(restaurantId: string, itemId: string): Promise<void> {
  await deleteDoc(doc(db, 'restaurants', restaurantId, 'menuItems', itemId));
}
