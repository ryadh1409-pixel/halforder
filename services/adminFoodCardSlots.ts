import {
  ADMIN_FOOD_CARD_SLOT_IDS,
  type AdminFoodCardSlotId,
} from '../constants/adminFoodCards';
import type { PromotionBadgeValue } from '@/lib/promotionBadge';
import { mapAdminFoodShareDoc } from './adminFoodSharesService';
import { auth, db } from './firebase';
import {
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
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
  availableFromMs: number | null;
  availableUntilMs: number | null;
  aiDescription: string;
  restaurantName: string;
  promotionBadge: PromotionBadgeValue;
  fulfillmentMode: 'delivery' | 'pickup';
};

const COLLECTION = 'adminFoodShares';

function readVenueLocation(raw?: Record<string, unknown>): string {
  if (!raw) return '';
  const pickup =
    typeof raw.pickupAddress === 'string' ? raw.pickupAddress.trim() : '';
  if (pickup) return pickup;
  const venue =
    typeof raw.venueLocation === 'string' ? raw.venueLocation.trim() : '';
  if (venue) return venue;
  if (typeof raw.location === 'string') return raw.location.trim();
  return '';
}

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
    venueLocation: readVenueLocation(raw),
    active: share.active,
    availableFromMs: share.availableFromMs,
    availableUntilMs: share.availableUntilMs,
    aiDescription: share.description,
    restaurantName: share.restaurantName,
    promotionBadge: share.promotionBadge,
    fulfillmentMode: share.fulfillmentMode,
  };
}

export function subscribeAdminFoodCardSlots(
  onData: (rows: AdminFoodCardSlot[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    query(
      collection(db, COLLECTION),
      where(documentId(), 'in', [...ADMIN_FOOD_CARD_SLOT_IDS]),
    ),
    (snap) => {
      const byId = new Map<string, Record<string, unknown>>();
      snap.docs.forEach((d) => byId.set(d.id, d.data() as Record<string, unknown>));
      const rows = ADMIN_FOOD_CARD_SLOT_IDS.map((sid) =>
        slotFromShare(sid, byId.get(sid)),
      );
      onData(rows);
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
    availableFromMs?: number | null;
    availableUntilMs?: number | null;
    aiDescription?: string;
    restaurantName?: string;
    promotionBadge?: PromotionBadgeValue;
    fulfillmentMode?: 'delivery' | 'pickup';
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
  const availableFromMs = input.availableFromMs ?? null;
  const availableUntilMs = input.availableUntilMs ?? null;
  if (
    availableFromMs != null &&
    availableUntilMs != null &&
    availableUntilMs <= availableFromMs
  ) {
    throw new Error('Available Until must be after Available From.');
  }

  const description =
    typeof input.aiDescription === 'string' && input.aiDescription.trim()
      ? input.aiDescription.trim()
      : '';

  const venueLocation =
    typeof input.venueLocation === 'string' ? input.venueLocation.trim() : '';

  const docRef = doc(db, COLLECTION, slotDocId);
  const existing = await getDoc(docRef);
  const isCreate = !existing.exists();

  console.log('[SAVE] collection', COLLECTION);
  console.log('[SAVE] document id', slotDocId);
  console.log('[SAVE] document exists', existing.exists());

  const promotionBadge: PromotionBadgeValue =
    input.promotionBadge && input.promotionBadge !== 'none'
      ? input.promotionBadge
      : 'none';

  const fulfillmentMode =
    input.fulfillmentMode === 'pickup' ? 'pickup' : 'delivery';
  const isPickup = fulfillmentMode === 'pickup';

  const payload: Record<string, unknown> = {
    foodName,
    restaurantName:
      typeof input.restaurantName === 'string' && input.restaurantName.trim()
        ? input.restaurantName.trim()
        : 'HalfOrder',
    image,
    originalPrice: Number(originalPrice.toFixed(2)),
    sharedPrice: Number(sharedPrice.toFixed(2)),
    deliveryShare: isPickup ? 0 : Number(deliveryShare.toFixed(2)),
    description,
    active: input.active === true,
    availableFrom:
      availableFromMs == null
        ? deleteField()
        : Timestamp.fromMillis(availableFromMs),
    availableUntil:
      availableUntilMs == null
        ? deleteField()
        : Timestamp.fromMillis(availableUntilMs),
    fulfillmentMode,
    pickupOnly: isPickup,
    deliveryEnabled: !isPickup,
    promotionBadge,
    promotionBadges: promotionBadge === 'none' ? [] : [promotionBadge],
    updatedAt: serverTimestamp(),
    ...(venueLocation
      ? {
          venueLocation,
          pickupAddress: venueLocation,
          location: venueLocation,
        }
      : {}),
  };

  if (isCreate) {
    payload.createdAt = serverTimestamp();
  }

  console.log('[SAVE] payload', {
    ...payload,
    updatedAt: '[serverTimestamp]',
    createdAt: isCreate ? '[serverTimestamp]' : '[preserved]',
  });

  try {
    await setDoc(docRef, payload, { merge: true });
    console.log('[SAVE] Firestore write succeeded', { collection: COLLECTION, id: slotDocId });
  } catch (error) {
    console.error('[SAVE ERROR]', error);
    throw error;
  }
}
