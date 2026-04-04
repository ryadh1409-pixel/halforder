import {
  ADMIN_FOOD_CARD_SLOT_IDS,
  type AdminFoodCardSlotId,
} from '@/constants/adminFoodCards';
import { auth, db } from '@/services/firebase';
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
  venueLocation: string;
  active: boolean;
  aiDescription: string;
  restaurantName: string;
};

function coerceSlot(
  docId: AdminFoodCardSlotId,
  raw?: Record<string, unknown>,
): AdminFoodCardSlot {
  const idNum =
    raw && typeof raw.id === 'number' ? raw.id : Number.parseInt(docId, 10) || 1;
  const price =
    typeof raw?.price === 'number' && raw.price > 0 ? raw.price : 0;
  const splitFallback =
    price > 0 ? Number((price / 2).toFixed(2)) : 0;
  const sharing =
    typeof raw?.sharingPrice === 'number' && raw.sharingPrice > 0
      ? raw.sharingPrice
      : typeof raw?.splitPrice === 'number' && raw.splitPrice > 0
        ? raw.splitPrice
        : splitFallback;
  let venue = '';
  const loc = raw?.location;
  if (typeof loc === 'string' && loc.trim()) venue = loc.trim();
  return {
    docId,
    id: idNum,
    title: typeof raw?.title === 'string' ? raw.title : '',
    image: typeof raw?.image === 'string' ? raw.image : '',
    price,
    sharingPrice: sharing,
    venueLocation: venue,
    active: raw?.active === true,
    aiDescription:
      typeof raw?.aiDescription === 'string' ? raw.aiDescription : '',
    restaurantName:
      typeof raw?.restaurantName === 'string' && raw.restaurantName.trim()
        ? raw.restaurantName.trim()
        : 'HalfOrder',
  };
}

export function subscribeAdminFoodCardSlots(
  onData: (rows: AdminFoodCardSlot[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, 'food_cards'),
      where(documentId(), 'in', [...ADMIN_FOOD_CARD_SLOT_IDS]),
    ),
    (snap) => {
      const byId = new Map<string, Record<string, unknown>>();
      snap.docs.forEach((d) => {
        byId.set(d.id, d.data() as Record<string, unknown>);
      });
      const rows: AdminFoodCardSlot[] = ADMIN_FOOD_CARD_SLOT_IDS.map((sid) =>
        coerceSlot(sid, byId.get(sid)),
      );
      onData(rows);
    },
    (e) => {
      console.warn('[adminFoodCardSlots] snapshot error', e);
      onError?.(e instanceof Error ? e : new Error('Failed to load slots'));
      onData(ADMIN_FOOD_CARD_SLOT_IDS.map((sid) => coerceSlot(sid)));
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
    venueLocation?: string;
    active: boolean;
    aiDescription?: string;
    restaurantName?: string;
  },
): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');
  const price = Number(input.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Valid price required');
  }
  const sharing = Number(input.sharingPrice);
  if (!Number.isFinite(sharing) || sharing <= 0) {
    throw new Error('Valid sharing price per person is required');
  }
  const title = input.title.trim();
  if (!title) throw new Error('Title required');
  const image = input.image.trim();
  if (!image) throw new Error('Image required');

  const aiTrim =
    typeof input.aiDescription === 'string' && input.aiDescription.trim()
      ? input.aiDescription.trim()
      : '';

  const venue =
    typeof input.venueLocation === 'string' ? input.venueLocation.trim() : '';
  const shareFixed = Number(sharing.toFixed(2));

  await setDoc(
    doc(db, 'food_cards', slotDocId),
    {
      id: input.id,
      title,
      image,
      price,
      sharingPrice: shareFixed,
      splitPrice: shareFixed,
      location: venue,
      active: input.active === true,
      maxUsers: 2,
      restaurantName:
        typeof input.restaurantName === 'string' &&
        input.restaurantName.trim()
          ? input.restaurantName.trim()
          : 'HalfOrder',
      createdAt: serverTimestamp(),
      ...(aiTrim ? { aiDescription: aiTrim } : {}),
    },
    { merge: true },
  );
}
