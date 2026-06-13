import {
  ADMIN_FOOD_CARD_SLOT_IDS,
  type AdminFoodCardSlotId,
} from '../constants/adminFoodCards';
import { mapAdminFoodShareDoc } from './adminFoodSharesService';
import { auth, db } from './firebase';
import {
  collection,
  doc,
  documentId,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

export type AdminFoodCardSlot = {
  docId: AdminFoodCardSlotId;
  id: number;
  title: string;
  image: string;
  price: number;
  sharingPrice: number;
  deliveryShare: number;
  venueLocation: string;
  active: boolean;
  aiDescription: string;
  restaurantName: string;
};

function slotFromShare(
  docId: AdminFoodCardSlotId,
  raw?: Record<string, unknown>,
): AdminFoodCardSlot {
  const share = mapAdminFoodShareDoc(docId, raw ?? {});
  const idNum = Number.parseInt(docId, 10) || 1;
  return {
    docId,
    id: idNum,
    title: share.foodName,
    image: share.image,
    price: share.originalPrice,
    sharingPrice: share.sharedPrice,
    deliveryShare: share.deliveryShare,
    venueLocation: '',
    active: share.active,
    aiDescription: share.description,
    restaurantName: share.restaurantName,
  };
}

export function subscribeAdminFoodCardSlots(
  onData: (rows: AdminFoodCardSlot[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'adminFoodShares'),
      where(documentId(), 'in', [...ADMIN_FOOD_CARD_SLOT_IDS]),
    ),
    (snap) => {
      const byId = new Map<string, Record<string, unknown>>();
      snap.docs.forEach((d) => byId.set(d.id, d.data() as Record<string, unknown>));
      onData(
        ADMIN_FOOD_CARD_SLOT_IDS.map((sid) => slotFromShare(sid, byId.get(sid))),
      );
    },
    (e) => {
      console.warn('[adminFoodCardSlots] snapshot error', e);
      onError?.(e instanceof Error ? e : new Error('Failed to load slots'));
      onData(ADMIN_FOOD_CARD_SLOT_IDS.map((sid) => slotFromShare(sid)));
    },
  );
}

export async function saveAdminFoodCardSlot(
  slotDocId: AdminFoodCardSlotId,
  input: {
    id: number;
    title: string;
    image: string;
    price: number;
    sharingPrice: number;
    deliveryShare: number;
    venueLocation?: string;
    active: boolean;
    aiDescription?: string;
    restaurantName?: string;
  },
): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');
  const originalPrice = Number(input.price);
  if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
    throw new Error('Valid original price required');
  }
  const sharedPrice = Number(input.sharingPrice);
  if (!Number.isFinite(sharedPrice) || sharedPrice <= 0) {
    throw new Error('Valid shared food price required');
  }
  const deliveryShare = Number(input.deliveryShare);
  if (!Number.isFinite(deliveryShare) || deliveryShare < 0) {
    throw new Error('Valid delivery share required');
  }
  const foodName = input.title.trim();
  if (!foodName) throw new Error('Food name required');
  const image = input.image.trim();
  if (!image) throw new Error('Image required');

  const description =
    typeof input.aiDescription === 'string' && input.aiDescription.trim()
      ? input.aiDescription.trim()
      : '';

  await setDoc(
    doc(db, 'adminFoodShares', slotDocId),
    {
      foodName,
      restaurantName:
        typeof input.restaurantName === 'string' &&
        input.restaurantName.trim()
          ? input.restaurantName.trim()
          : 'HalfOrder',
      image,
      originalPrice: Number(originalPrice.toFixed(2)),
      sharedPrice: Number(sharedPrice.toFixed(2)),
      deliveryShare: Number(deliveryShare.toFixed(2)),
      description,
      active: input.active === true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
