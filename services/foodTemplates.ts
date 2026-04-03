/**
 * Firestore `foodTemplates` — catalog for the home screen (max 10 documents).
 */
import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

export const FOOD_TEMPLATES_COLLECTION = 'foodTemplates';
export const FOOD_TEMPLATES_MAX = 10;

export type FoodTemplate = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  createdAt: Timestamp | null;
};

export type FoodTemplateInput = {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
};

function mapTemplateDoc(
  id: string,
  data: Record<string, unknown>,
): FoodTemplate {
  const createdAt = data.createdAt as Timestamp | undefined;
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    price: typeof data.price === 'number' && Number.isFinite(data.price) ? data.price : 0,
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    createdAt: createdAt ?? null,
  };
}

export async function countFoodTemplates(): Promise<number> {
  const snap = await getDocs(collection(db, FOOD_TEMPLATES_COLLECTION));
  return snap.size;
}

export function subscribeFoodTemplates(
  onUpdate: (rows: FoodTemplate[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, FOOD_TEMPLATES_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(FOOD_TEMPLATES_MAX),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) =>
        mapTemplateDoc(d.id, d.data() as Record<string, unknown>),
      );
      onUpdate(rows);
    },
    (e) => onError?.(e),
  );
}

export async function fetchFoodTemplatesOnce(): Promise<FoodTemplate[]> {
  const q = query(
    collection(db, FOOD_TEMPLATES_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(FOOD_TEMPLATES_MAX),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    mapTemplateDoc(d.id, d.data() as Record<string, unknown>),
  );
}

export async function addFoodTemplate(
  input: FoodTemplateInput,
): Promise<string> {
  const n = await countFoodTemplates();
  if (n >= FOOD_TEMPLATES_MAX) {
    throw new Error(`Maximum ${FOOD_TEMPLATES_MAX} food templates reached.`);
  }
  const ref = await addDoc(collection(db, FOOD_TEMPLATES_COLLECTION), {
    name: input.name.trim(),
    description: input.description.trim(),
    price: input.price,
    imageUrl: input.imageUrl.trim(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateFoodTemplate(
  id: string,
  input: FoodTemplateInput,
): Promise<void> {
  const rid = id.trim();
  if (!rid) throw new Error('Invalid template id');
  await updateDoc(doc(db, FOOD_TEMPLATES_COLLECTION, rid), {
    name: input.name.trim(),
    description: input.description.trim(),
    price: input.price,
    imageUrl: input.imageUrl.trim(),
  });
}

export async function deleteFoodTemplate(id: string): Promise<void> {
  const rid = id.trim();
  if (!rid) throw new Error('Invalid template id');
  await deleteDoc(doc(db, FOOD_TEMPLATES_COLLECTION, rid));
}
