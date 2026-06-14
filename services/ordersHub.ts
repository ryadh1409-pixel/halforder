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
    const matchByShare = new Map<string, FoodShareMatchDoc>();
    for (const m of matches) {
      if (m.adminFoodShareId) matchByShare.set(m.adminFoodShareId, m);
    }

    const items: FoodShareHubItem[] = [];
    const seen = new Set<string>();

    for (const req of requests) {
      if (!req.adminFoodShareId) continue;
      bindShare(req.adminFoodShareId);
      const shareRaw = shareCache.get(req.adminFoodShareId) ?? null;
      const match =
        (req.matchId ? matches.find((m) => m.id === req.matchId) : null) ??
        matchByShare.get(req.adminFoodShareId) ??
        null;

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

    for (const match of matches) {
      const hubId = `match_${match.id}`;
      if (seen.has(hubId)) continue;
      bindShare(match.adminFoodShareId);
      const shareRaw = shareCache.get(match.adminFoodShareId) ?? null;
      const req =
        requests.find(
          (r) =>
            r.adminFoodShareId === match.adminFoodShareId ||
            r.matchId === match.id,
        ) ?? null;
      items.push(
        hubItemFromMatch({ match, request: req, shareRaw, myUid: uid }),
      );
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
