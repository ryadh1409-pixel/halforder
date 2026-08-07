import {
  hubItemFromMatch,
  hubItemFromWaiting,
  sortHubItems,
  type FoodShareHubItem,
} from '@/lib/ordersHubStatus';
import { mapAdminFoodShareDoc } from '@/services/adminFoodSharesService';
import { mapMatchDoc } from '@/services/foodShareMatchService';
import { auth, db } from '@/services/firebase';
import type { FoodShareMatchDoc, MatchRequestDoc } from '@/types/foodShare';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

function mapRequest(id: string, data: Record<string, unknown>): MatchRequestDoc {
  const statusRaw = String(data.status ?? 'WAITING').toUpperCase();
  const status =
    statusRaw === 'MATCHED' || statusRaw === 'CANCELLED' ? statusRaw : 'WAITING';
  return {
    id,
    adminFoodShareId:
      typeof data.adminFoodShareId === 'string' ? data.adminFoodShareId : '',
    userId: typeof data.userId === 'string' ? data.userId : '',
    userFirstName:
      typeof data.userFirstName === 'string' ? data.userFirstName : 'User',
    status,
    matchId: typeof data.matchId === 'string' ? data.matchId : null,
    createdAtMs: safeToMillis(data.createdAt),
  };
}

export function subscribeFoodShareHub(
  onData: (items: FoodShareHubItem[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onData([]);
    return () => {};
  }

  let requests: MatchRequestDoc[] = [];
  let matches: FoodShareMatchDoc[] = [];
  const shareCache = new Map<string, Record<string, unknown> | null>();
  const shareUnsubs = new Map<string, Unsubscribe>();

  const clearShareListeners = () => {
    shareUnsubs.forEach((u) => u());
    shareUnsubs.clear();
  };

  const bindShare = (adminFoodShareId: string) => {
    if (!adminFoodShareId || shareUnsubs.has(adminFoodShareId)) return;
    const unsub = onSnapshot(
      doc(db, 'adminFoodShares', adminFoodShareId),
      (snap) => {
        shareCache.set(
          adminFoodShareId,
          snap.exists() ? (snap.data() as Record<string, unknown>) : null,
        );
        emit();
      },
      () => {
        shareCache.set(adminFoodShareId, null);
        emit();
      },
    );
    shareUnsubs.set(adminFoodShareId, unsub);
  };

  const emit = () => {
    const items: FoodShareHubItem[] = [];
    const seen = new Set<string>();

    for (const req of requests) {
      if (!req.adminFoodShareId) continue;
      bindShare(req.adminFoodShareId);
      const shareRaw = shareCache.get(req.adminFoodShareId) ?? null;

      // CRITICAL: only look up the match by the request's OWN matchId.
      // Never fall back to "any match for this card" (matchByShare pattern).
      //
      // Why this matters for re-orders:
      //   After Order 1 completes, if the user creates Order 2 they start in
      //   WAITING state with matchId=null. An old match doc for this card still
      //   exists with lifecycle=COMPLETED. If we looked it up by adminFoodShareId,
      //   the new WAITING request would appear to have a COMPLETED match → the
      //   brand-new order lands in Past Orders immediately. Wrong.
      //
      //   By restricting the lookup to req.matchId only, a request with
      //   matchId=null correctly produces no match → hubItemFromWaiting fires →
      //   the new order appears in Active Orders as "Waiting for Partner". Correct.
      const match: FoodShareMatchDoc | null = req.matchId
        ? (matches.find((m) => m.id === req.matchId) ?? null)
        : null;

      // ── Debug log: every request → match join ─────────────────────────────
      const matchOrderId =
        match != null
          ? ((match as unknown as Record<string, unknown>).orderId ?? null)
          : null;
      const matchLifecycle = match?.lifecycle ?? null;
      const matchOrderStatus =
        match != null
          ? ((match as unknown as Record<string, unknown>).orderStatus ?? null)
          : null;
      const matchDeliveryStatus =
        match != null
          ? ((match as unknown as Record<string, unknown>).deliveryStatus ?? null)
          : null;
      const sectionPreview =
        !match && req.status === 'WAITING'
          ? 'active (waiting)'
          : match
            ? (() => {
                const lc = String(match.lifecycle ?? '').toUpperCase();
                const TERMINAL = new Set([
                  'COMPLETED','DELIVERED','DELIVERY_COMPLETE','DELIVERY_COMPLETED',
                  'DELIVERY_CONFIRMED','ORDER_COMPLETED','ORDER_DELIVERED','FINISHED','DONE',
                ]);
                const oS = String((match as unknown as Record<string, unknown>).orderStatus ?? '').toLowerCase();
                const dS = String((match as unknown as Record<string, unknown>).deliveryStatus ?? '').toLowerCase();
                if (TERMINAL.has(lc) || oS === 'delivered' || oS === 'completed' || dS === 'delivered') return 'completed';
                if (lc === 'CANCELLED' || match.status === 'CANCELLED') return 'cancelled';
                return 'active';
              })()
            : 'no-match';
      console.log('[ORDERS HUB] card join', {
        requestId: req.id,
        adminFoodShareId: req.adminFoodShareId,
        reqMatchId: req.matchId ?? '(null — WAITING)',
        reqStatus: req.status,
        resolvedMatchId: match?.id ?? '(none)',
        matchOrderId: matchOrderId ?? '(none)',
        lifecycle: matchLifecycle ?? '(none)',
        orderStatus: matchOrderStatus ?? '(none)',
        deliveryStatus: matchDeliveryStatus ?? '(none)',
        section: sectionPreview,
        matchIdEqualsReqMatchId: match ? match.id === req.matchId : 'n/a',
      });
      // ─────────────────────────────────────────────────────────────────────

      if (req.status === 'WAITING' && !match) {
        const item = hubItemFromWaiting({ request: req, shareRaw, myUid: uid });
        items.push(item);
        seen.add(item.hubId);
        continue;
      }

      if (match) {
        const item = hubItemFromMatch({
          match,
          request: req,
          shareRaw,
          myUid: uid,
        });
        items.push(item);
        seen.add(item.hubId);
      }
    }

    // Second pass: show any match docs that have no corresponding request
    // (e.g. partner side when the request is missing or not yet loaded).
    for (const match of matches) {
      const hubId = `match_${match.id}`;
      if (seen.has(hubId)) continue;
      bindShare(match.adminFoodShareId);
      const shareRaw = shareCache.get(match.adminFoodShareId) ?? null;
      const req =
        requests.find(
          (r) => r.matchId === match.id,
        ) ?? null;
      const item = hubItemFromMatch({ match, request: req, shareRaw, myUid: uid });
      console.log('[ORDERS HUB] orphaned match card', {
        matchId: match.id,
        adminFoodShareId: match.adminFoodShareId,
        lifecycle: match.lifecycle,
        section:
          item.status === 'completed' ? 'completed'
          : item.status === 'cancelled' ? 'cancelled'
          : 'active',
      });
      items.push(item);
    }

    onData(sortHubItems(items));
  };

  const unsubs: Unsubscribe[] = [
    onSnapshot(
      query(collection(db, 'matchRequests'), where('userId', '==', uid)),
      (snap) => {
        requests = snap.docs.map((d) =>
          mapRequest(d.id, d.data() as Record<string, unknown>),
        );
        requests.forEach((r) => bindShare(r.adminFoodShareId));
        emit();
      },
      (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
    ),
    onSnapshot(
      query(collection(db, 'matches'), where('users', 'array-contains', uid)),
      (snap) => {
        matches = snap.docs.map((d) => {
          const mapped = mapMatchDoc(d.id, d.data() as Record<string, unknown>);
          mapped.createdAtMs = safeToMillis(
            (d.data() as Record<string, unknown>).createdAt,
          );
          return mapped;
        });
        matches.forEach((m) => bindShare(m.adminFoodShareId));
        emit();
      },
      (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
    ),
  ];

  return () => {
    unsubs.forEach((u) => u());
    clearShareListeners();
  };
}

export async function fetchAdminFoodShareRaw(
  adminFoodShareId: string,
): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(db, 'adminFoodShares', adminFoodShareId));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

export function mapSharePreview(
  adminFoodShareId: string,
  raw: Record<string, unknown> | null,
) {
  if (!raw) return null;
  return mapAdminFoodShareDoc(adminFoodShareId, raw);
}
