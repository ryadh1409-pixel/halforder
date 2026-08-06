/**
 * Admin-only service: read all customer feedback from `orderFeedback`,
 * enriched with user profile data (name, email, photo) from `users/{userId}`
 * and food category from `matches/{orderId}` for HalfOrder entries.
 *
 * READ-ONLY — no writes. No schema changes.
 */
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  documentId,
  type Unsubscribe,
} from 'firebase/firestore';

/** One enriched feedback record for admin display. */
export type AdminFeedbackEntry = {
  /** Firestore doc ID: `{orderId}_{userId}` */
  id: string;
  /** matchId (for halforder) or orderId (for fullorder). */
  orderId: string;
  orderType: 'halforder' | 'fullorder' | string;
  userId: string;
  restaurantName: string | null;
  orderRating: number;
  restaurantRating: number;
  driverRating: number | null;
  comment: string | null;
  submittedAtMs: number | null;
  // ── Enriched via user profile lookup ──────────────────────────────────
  customerName: string | null;
  customerEmail: string | null;
  customerPhotoUrl: string | null;
  // ── Enriched via match doc lookup (halforder only) ────────────────────
  /** Food category / dish name from the match doc. */
  foodName: string | null;
  /** Slot ID (adminFoodShareId) for the food card, e.g. "1", "2". */
  adminFoodShareId: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toMs(v: unknown): number | null {
  return safeToMillis(v);
}

/** Chunk an array into sub-arrays of at most `size` items. */
function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Batch-fetch user profiles for all given UIDs.
 * Firestore `in` query supports max 30 items per query (use chunking).
 */
async function batchFetchUsers(
  uids: string[],
): Promise<Map<string, { name: string | null; email: string | null; photoUrl: string | null }>> {
  const result = new Map<string, { name: string | null; email: string | null; photoUrl: string | null }>();
  if (uids.length === 0) return result;

  // Chunk into groups of 30 (Firestore `in` limit)
  const chunks = chunk(uids, 30);
  await Promise.all(
    chunks.map(async (ids) => {
      try {
        const snap = await getDocs(
          query(collection(db, 'users'), where(documentId(), 'in', ids)),
        );
        snap.docs.forEach((d) => {
          const data = d.data();
          const displayName =
            normStr(data.displayName) ??
            normStr(data.firstName) ??
            normStr(data.name);
          result.set(d.id, {
            name: displayName,
            email: normStr(data.email),
            photoUrl:
              normStr(data.photoURL) ??
              normStr(data.photoUrl) ??
              normStr(data.profilePhoto),
          });
        });
      } catch {
        // Partial failure — skip missing users gracefully
      }
    }),
  );
  return result;
}

/**
 * Batch-fetch match docs for halforder entries to get food name + adminFoodShareId.
 * Match IDs are the `orderId` field when `orderType === 'halforder'`.
 */
async function batchFetchMatchFoodNames(
  matchIds: string[],
): Promise<Map<string, { foodName: string | null; adminFoodShareId: string | null }>> {
  const result = new Map<string, { foodName: string | null; adminFoodShareId: string | null }>();
  if (matchIds.length === 0) return result;

  const chunks = chunk(matchIds, 30);
  await Promise.all(
    chunks.map(async (ids) => {
      try {
        const snap = await getDocs(
          query(collection(db, 'matches'), where(documentId(), 'in', ids)),
        );
        snap.docs.forEach((d) => {
          const data = d.data();
          const foodName =
            normStr(data.foodName) ??
            normStr(data.title) ??
            normStr(data.name);
          const adminFoodShareId =
            normStr(data.adminFoodShareId) ??
            normStr(data.foodShareId);
          result.set(d.id, { foodName, adminFoodShareId });
        });
      } catch {
        // Partial failure — skip gracefully
      }
    }),
  );
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 100;

/**
 * Subscribe to all customer feedback (ordered newest-first), enriched with
 * user profile and food category data. Admin use only.
 *
 * @param onData Callback with the enriched entry list.
 * @param onError Optional error callback.
 * @param maxEntries Max feedback docs to return (default 100).
 */
export function subscribeAdminFeedback(
  onData: (entries: AdminFeedbackEntry[]) => void,
  onError?: (err: Error) => void,
  maxEntries = DEFAULT_LIMIT,
): Unsubscribe {
  let cancelled = false;

  const q = query(
    collection(db, 'orderFeedback'),
    orderBy('submittedAt', 'desc'),
    limit(maxEntries),
  );

  const unsub = onSnapshot(
    q,
    async (snap) => {
      if (cancelled) return;

      // ── Build raw entries ────────────────────────────────────────────────
      const rawEntries = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          orderId: normStr(data.orderId) ?? d.id.split('_')[0] ?? '',
          orderType: normStr(data.orderType) ?? 'halforder',
          userId: normStr(data.userId) ?? '',
          restaurantName: normStr(data.restaurantName),
          orderRating: typeof data.orderRating === 'number' ? data.orderRating : 0,
          restaurantRating: typeof data.restaurantRating === 'number' ? data.restaurantRating : 0,
          driverRating: typeof data.driverRating === 'number' ? data.driverRating : null,
          comment: normStr(data.comment),
          submittedAtMs: toMs(data.submittedAt),
        };
      });

      // ── Collect IDs to enrich ────────────────────────────────────────────
      const uniqueUserIds = [...new Set(rawEntries.map((e) => e.userId).filter(Boolean))];
      const halforderMatchIds = [
        ...new Set(
          rawEntries
            .filter((e) => e.orderType === 'halforder' && e.orderId)
            .map((e) => e.orderId),
        ),
      ];

      // ── Batch-fetch enrichment data ──────────────────────────────────────
      const [userProfiles, matchFoodNames] = await Promise.all([
        batchFetchUsers(uniqueUserIds),
        batchFetchMatchFoodNames(halforderMatchIds),
      ]);

      if (cancelled) return;

      // ── Merge and emit ───────────────────────────────────────────────────
      const enriched: AdminFeedbackEntry[] = rawEntries.map((e) => {
        const profile = userProfiles.get(e.userId);
        const matchInfo =
          e.orderType === 'halforder' ? matchFoodNames.get(e.orderId) : undefined;
        return {
          ...e,
          customerName: profile?.name ?? null,
          customerEmail: profile?.email ?? null,
          customerPhotoUrl: profile?.photoUrl ?? null,
          foodName: matchInfo?.foodName ?? null,
          adminFoodShareId: matchInfo?.adminFoodShareId ?? null,
        };
      });

      onData(enriched);
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );

  return () => {
    cancelled = true;
    unsub();
  };
}
