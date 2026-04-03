import { ADMIN_UID } from '@/constants/adminUid';
import { auth, db } from '@/services/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

export type FoodCard = {
  id: string;
  title: string;
  image: string;
  restaurantName: string;
  price: number;
  splitPrice: number;
  location: { latitude: number; longitude: number } | null;
  createdAt: Timestamp | null;
  expiresAt: number;
  /** Open deck = `active`; `matched` / `full` = closed to new joins. */
  status: 'active' | 'matched' | 'full';
  ownerId?: string;
  joinedUsers?: string[];
  maxUsers?: number;
  user1?: { uid: string; name: string; photo: string | null } | null;
  user2?: { uid: string; name: string; photo: string | null } | null;
};

const FOOD_CARDS = 'food_cards';

/** Listing lifetime from creation (45 minutes). */
export const FOOD_CARD_TTL_MS = 45 * 60 * 1000;

export function foodCardExpiresAtFromNow(nowMs = Date.now()): number {
  return nowMs + FOOD_CARD_TTL_MS;
}

export function isActiveFoodCardStatus(status: string): boolean {
  return status === 'active';
}

/** All docs still marked `active` (includes expired until automation cleans up). */
export function queryAllActiveFoodCards() {
  return query(collection(db, FOOD_CARDS), where('status', '==', 'active'));
}

/**
 * User-visible deck: `status == "active"` and `expiresAt > nowMs` (server-side filter).
 * Pass fresh `Date.now()` when building the listener so the query matches current time.
 */
export function queryVisibleActiveFoodCards(nowMs: number = Date.now()) {
  return query(
    collection(db, FOOD_CARDS),
    where('status', '==', 'active'),
    where('expiresAt', '>', nowMs),
  );
}

/** @deprecated Use `queryVisibleActiveFoodCards` for user-facing counts; `queryAllActiveFoodCards` for maintenance. */
export function queryActiveFoodCards(nowMs: number = Date.now()) {
  return queryVisibleActiveFoodCards(nowMs);
}

function coerceExpiresAtMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object' && raw !== null && 'toMillis' in raw) {
    const fn = (raw as { toMillis: () => number }).toMillis;
    if (typeof fn === 'function') {
      const ms = fn.call(raw);
      return typeof ms === 'number' ? ms : 0;
    }
  }
  return 0;
}

/**
 * Real-time listener for the swipe/browse deck: **`food_cards`** only (not `orders`),
 * `where("status","==","active")` + `where("expiresAt", ">", Date.now())`, plus client-side
 * expiry guard so cards drop off as soon as `expiresAt` passes even without a server event.
 */
export function subscribeActiveFoodCards(
  onData: (cards: FoodCard[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const queryNow = Date.now();
  return onSnapshot(
    queryVisibleActiveFoodCards(queryNow),
    (snap) => {
      const now = Date.now();
      const raw = snap.docs.map((d) => {
        const data = d.data() as Omit<FoodCard, 'id' | 'expiresAt'> & {
          expiresAt?: unknown;
        };
        const expiresAt = coerceExpiresAtMs(data.expiresAt);
        return {
          id: d.id,
          ...data,
          expiresAt,
        } as FoodCard;
      });
      console.log(
        `[food_cards] onSnapshot status==active expiresAt>${queryNow} rawDocs=${snap.size}`,
      );
      raw.forEach((c) => {
        console.log(
          `[food_cards] card id=${c.id} status=${String(c.status)} expiresAt=${c.expiresAt}`,
        );
      });
      const cards = raw.filter((card) => (card.expiresAt ?? 0) > now);
      console.log(
        `[food_cards] visibleAfterClientExpiryCheck count=${cards.length}`,
      );
      onData(cards);
    },
    (e) => {
      console.warn('[food_cards] listener error', e);
      onData([]);
      onError?.(e instanceof Error ? e : new Error('Failed to load food cards'));
    },
  );
}

/** @deprecated Use `subscribeActiveFoodCards` */
export const subscribeWaitingFoodCards = subscribeActiveFoodCards;

export async function joinFoodCard(cardId: string): Promise<{
  matched: boolean;
  chatId?: string;
  otherUser?: { uid: string; name: string; photo: string | null };
}> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  const userName =
    auth.currentUser?.displayName?.trim() ||
    auth.currentUser?.email?.split('@')[0] ||
    'User';
  const userPhoto = auth.currentUser?.photoURL ?? null;
  const cardRef = doc(db, FOOD_CARDS, cardId);
  const self = { uid, name: userName, photo: userPhoto };

  const txResult = await runTransaction(db, async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists()) throw new Error('Card not found');
    const data = snap.data() as Omit<FoodCard, 'id'>;
    if (!isActiveFoodCardStatus(data.status)) throw new Error('Card no longer available');

    if (!data.user1?.uid) {
      tx.update(cardRef, {
        user1: self,
      });
      return { matched: false as const };
    }
    if (data.user1.uid === uid) {
      return { matched: false as const };
    }
    if (data.user2?.uid) {
      throw new Error('Card already matched');
    }

    const host = data.user1;
    tx.update(cardRef, {
      user2: self,
      status: 'matched',
    });
    return {
      matched: true as const,
      user1: host,
      user2: self,
    };
  });

  if (!txResult.matched) {
    return { matched: false };
  }

  const { user1, user2 } = txResult;
  if (!user1?.uid || !user2?.uid) {
    return { matched: false };
  }

  const other = user1.uid === uid ? user2 : user1;
  const ids = [other.uid, uid].sort();
  const chatId = cardId;
  const now = Date.now();
  await setDoc(
    doc(db, 'chats', chatId),
    {
      users: ids,
      participants: ids,
      usersData: [other, self],
      user1,
      user2,
      orderId: cardId,
      type: 'food_card',
      lastMessage: 'Match created',
      lastMessageAt: now,
      createdAt: now,
      typing: null,
      unreadCount: 0,
    },
    { merge: true },
  );

  const firstMessage = 'You both joined this order 🍕';
  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    text: firstMessage,
    senderId: 'system',
    sender: 'system',
    userName: 'System',
    createdAt: now,
    delivered: true,
    seen: false,
    system: true,
  });
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: firstMessage,
    lastMessageAt: Date.now(),
  });
  console.log('System added');

  return { matched: true, chatId, otherUser: other };
}

export type JoinOrderResult = {
  /** True when this uid was already listed in `joinedUsers` (no write performed). */
  alreadyJoined: boolean;
  /** True after this join when `joinedUsers.length` reached `maxUsers`. */
  isFull: boolean;
};

function isCardOwnedByUser(card: FoodCard, uid: string): boolean {
  if (typeof card.ownerId === 'string' && card.ownerId === uid) return true;
  if (card.user1?.uid === uid) return true;
  return false;
}

/** Disable the food-card Join control when signed out, already in `joinedUsers`, at capacity, admin preview, or own card. */
export function isFoodCardJoinDisabled(
  card: FoodCard,
  uid: string | undefined,
): boolean {
  if (!uid) return true;
  if (uid === ADMIN_UID) return true;
  if (isCardOwnedByUser(card, uid)) return true;
  const cap =
    typeof card.maxUsers === 'number' && card.maxUsers > 0 ? card.maxUsers : 2;
  const joined = Array.isArray(card.joinedUsers)
    ? card.joinedUsers.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  if (card.status === 'full' || card.status === 'matched') return true;
  if (!isActiveFoodCardStatus(card.status)) return true;
  if (joined.includes(uid)) return true;
  if (joined.length >= cap) return true;
  return false;
}

/**
 * Join a food card order by appending the user to `joinedUsers`, using a
 * transaction so concurrent joins cannot oversubscribe.
 */
export async function joinOrder(
  cardId: string,
  uid: string,
): Promise<JoinOrderResult> {
  const trimmed = cardId.trim();
  if (!trimmed) throw new Error('Invalid card');

  const authedUid = auth.currentUser?.uid;
  if (!authedUid) throw new Error('Sign in required');
  if (!uid || uid !== authedUid) throw new Error('Not authorized');

  const cardRef = doc(db, FOOD_CARDS, trimmed);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(cardRef);
    if (!snap.exists()) throw new Error('Card not found');

    const data = snap.data() as Record<string, unknown>;
    const status = typeof data.status === 'string' ? data.status : '';
    if (!isActiveFoodCardStatus(status)) {
      throw new Error('This order is not open for joining');
    }

    const ownerId = typeof data.ownerId === 'string' ? data.ownerId : '';
    if (ownerId && ownerId === authedUid) {
      throw new Error('You cannot join your own card');
    }
    const u1 = data.user1 as { uid?: string } | null | undefined;
    if (u1 && typeof u1.uid === 'string' && u1.uid === authedUid) {
      throw new Error('You cannot join your own card');
    }

    const maxUsers =
      typeof data.maxUsers === 'number' && data.maxUsers > 0 ? data.maxUsers : 2;

    const joinedUsers = Array.isArray(data.joinedUsers)
      ? data.joinedUsers.filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];

    if (joinedUsers.includes(authedUid)) {
      return {
        alreadyJoined: true,
        isFull: joinedUsers.length >= maxUsers,
      };
    }

    if (joinedUsers.length >= maxUsers) {
      throw new Error('Order is full');
    }

    const nextJoined = [...joinedUsers, authedUid];
    const isFull = nextJoined.length >= maxUsers;

    tx.update(cardRef, {
      joinedUsers: nextJoined,
      status: isFull ? 'full' : 'active',
    });

    return { alreadyJoined: false, isFull };
  });
}

export async function createFoodCard(input: {
  title: string;
  image: string;
  restaurantName: string;
  price: number;
  splitPrice: number;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid || uid !== ADMIN_UID) throw new Error('Admin only');
  const activeSnap = await getDocs(queryVisibleActiveFoodCards());
  if (activeSnap.size >= 10) throw new Error('Max 10 active cards');
  const now = Date.now();
  return addDoc(collection(db, FOOD_CARDS), {
    title: input.title.trim(),
    image: input.image.trim(),
    restaurantName: input.restaurantName.trim(),
    price: input.price,
    splitPrice: input.splitPrice,
    location:
      input.latitude != null && input.longitude != null
        ? { latitude: input.latitude, longitude: input.longitude }
        : null,
    ownerId: uid,
    joinedUsers: [] as string[],
    maxUsers: 2,
    createdAt: serverTimestamp(),
    expiresAt: foodCardExpiresAtFromNow(now),
    status: 'active',
    user1: null,
    user2: null,
  });
}

async function duplicateCard(cardId: string) {
  const snap = await getDoc(doc(db, FOOD_CARDS, cardId));
  if (!snap.exists()) return;
  const data = snap.data();
  const now = Date.now();
  const owner =
    typeof data.ownerId === 'string' && data.ownerId
      ? data.ownerId
      : auth.currentUser?.uid ?? '';
  await addDoc(collection(db, FOOD_CARDS), {
    title: data.title ?? 'Food card',
    image: data.image ?? '',
    restaurantName: data.restaurantName ?? '',
    price: Number(data.price) || 0,
    splitPrice: Number(data.splitPrice) || 0,
    location: data.location ?? null,
    ownerId: owner,
    joinedUsers: [] as string[],
    maxUsers: 2,
    createdAt: serverTimestamp(),
    expiresAt: foodCardExpiresAtFromNow(now),
    status: 'active',
    user1: null,
    user2: null,
    regeneratedFrom: cardId,
  });
}

export async function runFoodCardAutomationOnce(): Promise<void> {
  const now = Date.now();
  const activeDeckSnap = await getDocs(queryAllActiveFoodCards());
  const matchedSnap = await getDocs(
    query(collection(db, FOOD_CARDS), where('status', '==', 'matched')),
  );

  const tasks: Promise<unknown>[] = [];
  activeDeckSnap.docs.forEach((d) => {
    const data = d.data();
    if (typeof data.expiresAt === 'number' && data.expiresAt <= now) {
      tasks.push(
        duplicateCard(d.id).finally(() => deleteDoc(doc(db, FOOD_CARDS, d.id))),
      );
    }
  });
  matchedSnap.docs.forEach((d) => {
    const data = d.data();
    if (!data.regenerated) {
      tasks.push(
        duplicateCard(d.id).finally(() =>
          updateDoc(doc(db, FOOD_CARDS, d.id), {
            regenerated: true,
            adminNotification: `Match completed: ${data.title ?? 'Food'} - 2 users joined`,
          }),
        ),
      );
    }
  });
  if (tasks.length) await Promise.allSettled(tasks);
}

export async function skipFoodCard(_cardId: string): Promise<void> {
  // Skip is local-only for feed UX. No write needed.
}

export function startFoodCardAutomation(): () => void {
  const id = setInterval(() => {
    runFoodCardAutomationOnce().catch(() => {});
  }, 60 * 1000);
  return () => clearInterval(id);
}
