/**
 * Firestore `foodTemplates` — home catalog (max 10 documents in collection).
 */
import { db } from '@/services/firebase';
import type { FoodTemplate, FoodTemplateWrite } from '@/types/food';
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

function mapTemplateDoc(
  id: string,
  data: Record<string, unknown>,
): FoodTemplate {
  const createdAt = data.createdAt as Timestamp | undefined;
  const active =
    data.active === false
      ? false
      : true;
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    description:
      typeof data.description === 'string' ? data.description : '',
    price:
      typeof data.price === 'number' && Number.isFinite(data.price)
        ? data.price
        : 0,
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    active,
    createdAt: createdAt ?? null,
  };
}

export async function countFoodTemplates(): Promise<number> {
  const snap = await getDocs(collection(db, FOOD_TEMPLATES_COLLECTION));
  return snap.size;
}

/** All templates (admin), newest first, capped for UI. */
export function subscribeAllFoodTemplates(
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

/** Active-only (home), newest first — filters client-side so legacy docs without `active` still show. */
export function subscribeActiveFoodTemplates(
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
      const rows = snap.docs
        .map((d) =>
          mapTemplateDoc(d.id, d.data() as Record<string, unknown>),
        )
        .filter((t) => t.active);
      onUpdate(rows);
    },
    (e) => onError?.(e),
  );
}

/** @deprecated Use subscribeActiveFoodTemplates */
export const subscribeFoodTemplates = subscribeActiveFoodTemplates;

export async function fetchAllFoodTemplatesOnce(): Promise<FoodTemplate[]> {
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

export async function fetchActiveFoodTemplatesOnce(): Promise<FoodTemplate[]> {
  const all = await fetchAllFoodTemplatesOnce();
  return all.filter((t) => t.active);
}

export async function addFoodTemplate(
  input: FoodTemplateWrite,
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
    active: input.active,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateFoodTemplate(
  id: string,
  input: FoodTemplateWrite,
): Promise<void> {
  const rid = id.trim();
  if (!rid) throw new Error('Invalid template id');
  await updateDoc(doc(db, FOOD_TEMPLATES_COLLECTION, rid), {
    name: input.name.trim(),
    description: input.description.trim(),
    price: input.price,
    imageUrl: input.imageUrl.trim(),
    active: input.active,
  });
}

export async function deleteFoodTemplate(id: string): Promise<void> {
  const rid = id.trim();
  if (!rid) throw new Error('Invalid template id');
  await deleteDoc(doc(db, FOOD_TEMPLATES_COLLECTION, rid));
}
