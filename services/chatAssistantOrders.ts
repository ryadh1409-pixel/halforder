import { db } from '@/services/firebase';
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';

/** Order statuses considered “active” / joinable for the assistant. */
const ACTIVE_ORDER_STATUSES = ['open', 'active', 'waiting'] as const;

const FOOD_INTENT_KEYWORDS = [
  'pizza',
  'hungry',
  'food',
  'order',
  'eat',
  'meal',
  'lunch',
  'dinner',
  'burger',
  'snack',
  'restaurant',
] as const;

export type AssistantOrderSummary = {
  id: string;
  restaurantName: string;
  mealType?: string;
  status?: string;
};

export function detectFoodIntent(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return FOOD_INTENT_KEYWORDS.some((kw) => normalized.includes(kw));
}

/**
 * Fetches up to `scanLimit` docs from Firestore, filters out expired orders,
 * returns at most `maxResults` summaries (default 3).
 */
export async function fetchActiveJoinableOrders(
  maxResults: number,
  scanLimit: number = 40,
): Promise<AssistantOrderSummary[]> {
  const q = query(
    collection(db, 'orders'),
    where('status', 'in', [...ACTIVE_ORDER_STATUSES]),
    limit(scanLimit),
  );
  const snap = await getDocs(q);
  const now = Date.now();
  const out: AssistantOrderSummary[] = [];

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const exp =
      typeof data.expiresAt === 'number' ? data.expiresAt : null;
    if (exp != null && exp <= now) {
      continue;
    }
    out.push({
      id: d.id,
      restaurantName:
        typeof data.restaurantName === 'string' && data.restaurantName.trim()
          ? data.restaurantName.trim()
          : 'Order',
      mealType:
        typeof data.mealType === 'string' ? data.mealType : undefined,
      status: typeof data.status === 'string' ? data.status : undefined,
    });
    if (out.length >= maxResults) {
      break;
    }
  }

  return out;
}
