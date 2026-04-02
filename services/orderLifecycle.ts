import {
  doc,
  runTransaction,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';

import { db } from '@/services/firebase';

/** 45-minute window after a user joins (participant record). */
export const ORDER_JOIN_WINDOW_MS = 45 * 60 * 1000;

export type OrderParticipantRecord = {
  userId: string;
  joinedAt: Timestamp;
};

export function parseJoinedAtMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'object' && v !== null && 'toMillis' in v) {
    const fn = (v as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') return fn.call(v);
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

export function normalizeOrderParticipantRecords(
  raw: unknown,
): OrderParticipantRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: OrderParticipantRecord[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const userId = (entry as { userId?: unknown }).userId;
    if (typeof userId !== 'string' || !userId) continue;
    const joinedAt = (entry as { joinedAt?: unknown }).joinedAt;
    const ms = parseJoinedAtMs(joinedAt);
    if (joinedAt != null && ms == null) continue;
    if (ms != null && joinedAt && typeof joinedAt === 'object' && 'toMillis' in joinedAt) {
      out.push({ userId, joinedAt: joinedAt as Timestamp });
    }
  }
  return out;
}

export function getParticipantJoinedAtForUser(
  records: OrderParticipantRecord[],
  uid: string,
): Timestamp | null {
  const r = records.find((p) => p.userId === uid);
  return r?.joinedAt ?? null;
}

export function remainingMsAfterJoin(joinedAtMs: number | null, now: number): number | null {
  if (joinedAtMs == null) return null;
  return ORDER_JOIN_WINDOW_MS - (now - joinedAtMs);
}

export type LifecycleDisplayStatus =
  | 'waiting'
  | 'active'
  | 'expired'
  | 'cancelled';

export function deriveLifecycleForViewer(input: {
  uid: string;
  createdBy: string;
  participantIds: string[];
  participantRecords: OrderParticipantRecord[];
  orderStatus: string;
  now: number;
}): {
  lifecycle: LifecycleDisplayStatus;
  remainingMs: number | null;
  joinedAtMs: number | null;
} {
  const { uid, createdBy, participantIds, participantRecords, orderStatus, now } =
    input;
  if (orderStatus === 'cancelled') {
    return {
      lifecycle: 'cancelled',
      remainingMs: null,
      joinedAtMs: null,
    };
  }
  if (orderStatus === 'expired') {
    return {
      lifecycle: 'expired',
      remainingMs: null,
      joinedAtMs: null,
    };
  }
  const joinedAt = getParticipantJoinedAtForUser(participantRecords, uid);
  const joinedAtMs = joinedAt ? parseJoinedAtMs(joinedAt) : null;
  const rem = remainingMsAfterJoin(joinedAtMs, now);

  if (joinedAtMs != null && rem != null && rem <= 0) {
    return { lifecycle: 'expired', remainingMs: rem, joinedAtMs };
  }

  if (participantIds.includes(uid)) {
    if (joinedAtMs == null) {
      const onlyHost =
        participantIds.length === 1 && participantIds[0] === createdBy;
      const isCreator = uid === createdBy;
      if (isCreator && onlyHost) {
        return { lifecycle: 'waiting', remainingMs: null, joinedAtMs: null };
      }
      return { lifecycle: 'active', remainingMs: null, joinedAtMs: null };
    }
    return {
      lifecycle: 'active',
      remainingMs: rem,
      joinedAtMs,
    };
  }

  return { lifecycle: 'waiting', remainingMs: null, joinedAtMs: null };
}

export function formatOrderCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '⏱ 0 min left';
  const mins = Math.ceil(remainingMs / 60000);
  return `⏱ ${mins} min left`;
}

export function mergeParticipantRecordsForJoin(
  existing: OrderParticipantRecord[],
  uid: string,
  joinedAt: Timestamp,
): OrderParticipantRecord[] {
  const without = existing.filter((p) => p.userId !== uid);
  return [...without, { userId: uid, joinedAt }];
}

export function mergeParticipantRecordsForLeave(
  existing: OrderParticipantRecord[],
  uid: string,
): OrderParticipantRecord[] {
  return existing.filter((p) => p.userId !== uid);
}

export type JoinOrderParticipantExtras = {
  status?: string;
  user2Id?: string;
  user2Name?: string;
};

export type JoinOrderWithParticipantOptions = {
  /** When true, join only if current `status` is `'open'`. */
  requireOpenForJoin?: boolean;
  /** If set, merged into the update after computing `nextIds` (overrides `extras.status` when both set). */
  resolveStatus?: (nextParticipantCount: number, maxPeople: number) => string | undefined;
};

/**
 * Idempotent: if uid already in participantIds, only backfills participants entry when missing.
 */
export async function joinOrderWithParticipantRecord(
  firestore: Firestore,
  orderId: string,
  uid: string,
  extras: JoinOrderParticipantExtras = {},
  options: JoinOrderWithParticipantOptions = {},
): Promise<void> {
  const trimmed = orderId.trim();
  if (!trimmed) throw new Error('Invalid order.');
  const orderRef = doc(firestore, 'orders', trimmed);
  const joinedAt = Timestamp.now();

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error('Order no longer exists.');
    const d = snap.data() as Record<string, unknown>;
    if (options.requireOpenForJoin && d.status !== 'open') {
      throw new Error('Order is not open');
    }
    const participantIds: string[] = Array.isArray(d.participantIds)
      ? d.participantIds.filter((x): x is string => typeof x === 'string')
      : [];
    const records = normalizeOrderParticipantRecords(d.participants);
    const maxPeople =
      typeof d.maxPeople === 'number'
        ? d.maxPeople
        : typeof d.maxParticipants === 'number'
          ? d.maxParticipants
          : 2;

    if (participantIds.includes(uid)) {
      if (records.some((r) => r.userId === uid)) return;
      const nextRecords = mergeParticipantRecordsForJoin(records, uid, joinedAt);
      tx.update(orderRef, { participants: nextRecords });
      return;
    }

    if (participantIds.length >= maxPeople) {
      throw new Error('Order is already full.');
    }

    const nextIds = [...participantIds, uid];
    const nextRecords = mergeParticipantRecordsForJoin(records, uid, joinedAt);
    const resolved = options.resolveStatus?.(nextIds.length, maxPeople);
    const statusPatch =
      resolved !== undefined ? { status: resolved } : {};
    tx.update(orderRef, {
      participantIds: nextIds,
      participants: nextRecords,
      ...extras,
      ...statusPatch,
    });
  });
}

export async function leaveOrderParticipant(
  firestore: Firestore,
  orderId: string,
  uid: string,
): Promise<void> {
  const trimmed = orderId.trim();
  if (!trimmed) throw new Error('Invalid order.');
  const orderRef = doc(firestore, 'orders', trimmed);

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) throw new Error('Order no longer exists.');
    const d = snap.data() as Record<string, unknown>;
    const participantIds: string[] = Array.isArray(d.participantIds)
      ? d.participantIds.filter((x): x is string => typeof x === 'string')
      : [];
    if (!participantIds.includes(uid)) {
      throw new Error('Not in order');
    }

    const nextIds = participantIds.filter((id) => id !== uid);
    const records = normalizeOrderParticipantRecords(d.participants);
    const hadParticipantRecord = records.some((r) => r.userId === uid);

    const patch: Record<string, unknown> = {
      participantIds: nextIds,
    };
    if (hadParticipantRecord) {
      patch.participants = mergeParticipantRecordsForLeave(records, uid);
    }

    const currentStatus = typeof d.status === 'string' ? d.status : 'open';
    const maxPeople = Number(d.maxPeople ?? d.maxParticipants ?? 2);
    if (currentStatus === 'closed' && nextIds.length < maxPeople) {
      patch.status = 'open';
    }

    tx.update(orderRef, patch);
  });
}

export async function ensureParticipantRecordForUid(
  firestore: Firestore,
  orderId: string,
  uid: string,
): Promise<void> {
  await joinOrderWithParticipantRecord(firestore, orderId, uid, {});
}
