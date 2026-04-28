/**
 * Smart pool matching: score candidate groups, join best fit, or create (2km hard cap).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '@/services/firebase';
import {
  haversineDistanceMeters,
  SPLIT_MAX_DISTANCE_M,
} from '@/services/matching';

export type GroupStatus = 'waiting' | 'full' | 'ordered';

export type GroupDoc = {
  id: string;
  members: string[];
  foodType: string;
  maxSize: number;
  status: GroupStatus;
  anchorLocation: { lat: number; lng: number };
  centerLocation?: { lat: number; lng: number };
  createdAt: unknown;
};

export type GroupUserInput = {
  id: string;
  preferredFood: string;
  location: { lat: number; lng: number };
};

function parseLatLng(obj: unknown): { lat: number; lng: number } | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const lat = typeof o.lat === 'number' ? o.lat : null;
  const lng = typeof o.lng === 'number' ? o.lng : null;
  if (lat != null && lng != null) return { lat, lng };
  return null;
}

/** Prefer `centerLocation`, fall back to `anchorLocation` (legacy). */
export function getGroupCenter(
  group: Record<string, unknown>,
): { lat: number; lng: number } | null {
  const c = parseLatLng(group.centerLocation);
  if (c) return c;
  return parseLatLng(group.anchorLocation);
}

export function createdAtToMillis(createdAt: unknown): number | null {
  if (createdAt == null) return null;
  if (typeof createdAt === 'number' && Number.isFinite(createdAt)) {
    return createdAt < 1e12 ? createdAt * 1000 : createdAt;
  }
  if (
    typeof createdAt === 'object' &&
    createdAt !== null &&
    'toMillis' in createdAt &&
    typeof (createdAt as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (createdAt as { toMillis: () => number }).toMillis();
  }
  if (createdAt instanceof Date) return createdAt.getTime();
  return null;
}

/**
 * Higher score = better match (size, recency, proximity, waiting).
 */
export function scoreGroup(
  group: Record<string, unknown>,
  currentUser: GroupUserInput,
): number {
  let score = 0;

  const members = (group.members as string[]) ?? [];
  score += members.length * 2;

  const ms = createdAtToMillis(group.createdAt);
  if (ms != null) {
    const age = Date.now() - ms;
    if (age < 30_000) score += 3;
  }

  const center = getGroupCenter(group);
  if (center) {
    const distanceM = haversineDistanceMeters(
      currentUser.location.lat,
      currentUser.location.lng,
      center.lat,
      center.lng,
    );
    const distanceKm = distanceM / 1000;
    if (distanceKm < 1) score += 5;
    else if (distanceKm < 2) score += 3;
  }

  if (group.status === 'waiting') score += 2;

  return score;
}

/**
 * Among waiting groups for this food, pick highest score; only groups within 2km.
 */
export async function findBestGroup(
  currentUser: GroupUserInput,
): Promise<{
  id: string;
  data: Record<string, unknown>;
  score: number;
} | null> {
  const food = currentUser.preferredFood.trim().toLowerCase();
  if (!food || !currentUser.id) return null;

  const qRef = query(
    collection(db, 'groups'),
    where('foodType', '==', food),
    where('status', '==', 'waiting'),
  );
  const snap = await getDocs(qRef);

  let best: {
    id: string;
    data: Record<string, unknown>;
    score: number;
  } | null = null;

  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const members = (data.members as string[]) ?? [];
    if (members.length >= 4) return;
    if (members.includes(currentUser.id)) return;

    const center = getGroupCenter(data);
    if (!center) return;

    const distM = haversineDistanceMeters(
      currentUser.location.lat,
      currentUser.location.lng,
      center.lat,
      center.lng,
    );
    if (distM >= SPLIT_MAX_DISTANCE_M) return;

    const s = scoreGroup(data, currentUser);
    if (!best || s > best.score) {
      best = { id: d.id, data, score: s };
    }
  });

  return best;
}

async function joinGroupTransaction(
  groupId: string,
  userId: string,
): Promise<string> {
  return runTransaction(db, async (transaction) => {
    const ref = doc(db, 'groups', groupId);
    const fresh = await transaction.get(ref);
    if (!fresh.exists()) throw new Error('missing');
    const data = fresh.data() as Record<string, unknown>;
    const m = (data.members as string[]) ?? [];
    const st = data.status as string;
    if (st !== 'waiting' || m.length >= 4) throw new Error('full');
    if (m.includes(userId)) return groupId;
    const newMembers = [...m, userId];
    const full = newMembers.length >= 4;
    transaction.update(ref, {
      members: newMembers,
      status: (full ? 'full' : 'waiting') as GroupStatus,
    });
    return groupId;
  });
}

/**
 * Join best-scoring nearby group, or create a new one with `centerLocation` + `anchorLocation`.
 */
export async function smartMatch(currentUser: GroupUserInput): Promise<string> {
  const food = currentUser.preferredFood.trim().toLowerCase();
  if (!food || !currentUser.id) throw new Error('Invalid user');

  const userRef = doc(db, 'users', currentUser.id);
  const userSnap = await getDoc(userRef);
  const existingGid = userSnap.data()?.groupId;
  if (typeof existingGid === 'string' && existingGid) {
    const gSnap = await getDoc(doc(db, 'groups', existingGid));
    if (gSnap.exists()) return existingGid;
    await setDoc(userRef, { groupId: null }, { merge: true });
  }

  const best = await findBestGroup(currentUser);
  if (best) {
    try {
      const gid = await joinGroupTransaction(best.id, currentUser.id);
      await setDoc(
        userRef,
        { id: currentUser.id, groupId: gid },
        { merge: true },
      );
      return gid;
    } catch {
      /* create below */
    }
  }

  const newRef = doc(collection(db, 'groups'));
  const gid = newRef.id;
  const loc = {
    lat: currentUser.location.lat,
    lng: currentUser.location.lng,
  };
  await setDoc(newRef, {
    members: [currentUser.id],
    foodType: food,
    maxSize: 4,
    status: 'waiting' as GroupStatus,
    createdAt: serverTimestamp(),
    centerLocation: loc,
    anchorLocation: loc,
  });
  await setDoc(userRef, { id: currentUser.id, groupId: gid }, { merge: true });
  return gid;
}

/** @deprecated Use {@link smartMatch} — kept for existing imports. */
export async function findOrCreateGroup(
  currentUser: GroupUserInput,
): Promise<string> {
  return smartMatch(currentUser);
}

export async function markGroupOrdered(groupId: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    status: 'ordered' as GroupStatus,
  });
}

export async function leaveGroup(
  userId: string,
  groupId: string,
): Promise<void> {
  const groupRef = doc(db, 'groups', groupId);
  const userRef = doc(db, 'users', userId);

  await runTransaction(db, async (transaction) => {
    const gSnap = await transaction.get(groupRef);
    if (!gSnap.exists()) return;
    const data = gSnap.data() as Record<string, unknown>;
    const members = ((data.members as string[]) ?? []).filter(
      (id) => id !== userId,
    );
    if (members.length === 0) {
      transaction.delete(groupRef);
    } else {
      const status: GroupStatus = members.length >= 4 ? 'full' : 'waiting';
      transaction.update(groupRef, {
        members,
        status,
      });
    }
  });

  await setDoc(userRef, { groupId: null }, { merge: true });
}

export function groupDocFromSnapshot(
  id: string,
  data: Record<string, unknown>,
): GroupDoc {
  const center = getGroupCenter(data);
  return {
    id,
    members: Array.isArray(data.members) ? (data.members as string[]) : [],
    foodType: typeof data.foodType === 'string' ? data.foodType : '',
    maxSize: typeof data.maxSize === 'number' ? data.maxSize : 4,
    status: (data.status as GroupStatus) ?? 'waiting',
    anchorLocation: parseLatLng(data.anchorLocation) ??
      center ?? { lat: 0, lng: 0 },
    centerLocation: center ?? undefined,
    createdAt: data.createdAt,
  };
}
