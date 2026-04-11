/**
 * Pool-style group matching: 2–4 users per food type, within 2km of group anchor.
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
import { haversineDistanceMeters, SPLIT_MAX_DISTANCE_M } from '@/services/matching';

export type GroupStatus = 'waiting' | 'full' | 'ordered';

export type GroupDoc = {
  id: string;
  members: string[];
  foodType: string;
  maxSize: number;
  status: GroupStatus;
  anchorLocation: { lat: number; lng: number };
  createdAt: unknown;
};

export type GroupUserInput = {
  id: string;
  preferredFood: string;
  location: { lat: number; lng: number };
};

function parseAnchor(data: Record<string, unknown>): { lat: number; lng: number } | null {
  const a = data.anchorLocation;
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const lat = typeof o.lat === 'number' ? o.lat : null;
  const lng = typeof o.lng === 'number' ? o.lng : null;
  if (lat != null && lng != null) return { lat, lng };
  return null;
}

/**
 * Join an existing waiting group within 2km of anchor, or create a new group.
 */
export async function findOrCreateGroup(
  currentUser: GroupUserInput,
): Promise<string> {
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

  const qRef = query(
    collection(db, 'groups'),
    where('foodType', '==', food),
    where('status', '==', 'waiting'),
  );
  const snap = await getDocs(qRef);

  for (const d of snap.docs) {
    const raw = d.data() as Record<string, unknown>;
    const members = (raw.members as string[]) ?? [];
    if (members.includes(currentUser.id)) {
      await setDoc(
        userRef,
        { id: currentUser.id, groupId: d.id },
        { merge: true },
      );
      return d.id;
    }
    if (members.length >= 4) continue;

    const anchor = parseAnchor(raw);
    if (!anchor) continue;
    const dist = haversineDistanceMeters(
      currentUser.location.lat,
      currentUser.location.lng,
      anchor.lat,
      anchor.lng,
    );
    if (dist >= SPLIT_MAX_DISTANCE_M) continue;

    try {
      const gid = await runTransaction(db, async (transaction) => {
        const ref = doc(db, 'groups', d.id);
        const fresh = await transaction.get(ref);
        if (!fresh.exists()) throw new Error('missing');
        const data = fresh.data() as Record<string, unknown>;
        const m = (data.members as string[]) ?? [];
        const st = data.status as string;
        if (st !== 'waiting' || m.length >= 4) throw new Error('full');
        if (m.includes(currentUser.id)) return d.id;
        const newMembers = [...m, currentUser.id];
        const full = newMembers.length >= 4;
        transaction.update(ref, {
          members: newMembers,
          status: (full ? 'full' : 'waiting') as GroupStatus,
        });
        return d.id;
      });
      await setDoc(
        userRef,
        { id: currentUser.id, groupId: gid },
        { merge: true },
      );
      return gid;
    } catch {
      continue;
    }
  }

  const newRef = doc(collection(db, 'groups'));
  const gid = newRef.id;
  await setDoc(newRef, {
    members: [currentUser.id],
    foodType: food,
    maxSize: 4,
    status: 'waiting' as GroupStatus,
    createdAt: serverTimestamp(),
    anchorLocation: {
      lat: currentUser.location.lat,
      lng: currentUser.location.lng,
    },
  });
  await setDoc(
    userRef,
    { id: currentUser.id, groupId: gid },
    { merge: true },
  );
  return gid;
}

export async function markGroupOrdered(groupId: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    status: 'ordered' as GroupStatus,
  });
}

/**
 * Remove user from group; delete group if empty. Clears `groupId` on the user.
 */
export async function leaveGroup(userId: string, groupId: string): Promise<void> {
  const groupRef = doc(db, 'groups', groupId);
  const userRef = doc(db, 'users', userId);

  await runTransaction(db, async (transaction) => {
    const gSnap = await transaction.get(groupRef);
    if (!gSnap.exists()) return;
    const data = gSnap.data() as Record<string, unknown>;
    const members = ((data.members as string[]) ?? []).filter((id) => id !== userId);
    if (members.length === 0) {
      transaction.delete(groupRef);
    } else {
      const status: GroupStatus =
        members.length >= 4 ? 'full' : 'waiting';
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
  return {
    id,
    members: Array.isArray(data.members) ? (data.members as string[]) : [],
    foodType: typeof data.foodType === 'string' ? data.foodType : '',
    maxSize: typeof data.maxSize === 'number' ? data.maxSize : 4,
    status: (data.status as GroupStatus) ?? 'waiting',
    anchorLocation: parseAnchor(data) ?? { lat: 0, lng: 0 },
    createdAt: data.createdAt,
  };
}
