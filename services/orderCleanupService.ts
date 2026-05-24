import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';

import type { RestaurantOrder } from '@/services/orderService';
import { shouldAutoArchiveOrder } from '@/services/orderArchiveService';
import { db } from '@/services/firebase';

const CLEANUP_COOLDOWN_MS = 5 * 60 * 1000;
const CLEANUP_DEBOUNCE_MS = 2_500;
const MAX_BATCH_WRITES = 20;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

type FailedEntry = {
  failCount: number;
  retryAfterMs: number;
};

type RestaurantCleanupState = {
  lastRunAt: number;
  lastFailureAt: number;
  processedIds: Set<string>;
  failedIds: Map<string, FailedEntry>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  failureLogged: boolean;
};

const stateByRestaurant = new Map<string, RestaurantCleanupState>();

function getState(restaurantId: string): RestaurantCleanupState {
  let state = stateByRestaurant.get(restaurantId);
  if (!state) {
    state = {
      lastRunAt: 0,
      lastFailureAt: 0,
      processedIds: new Set(),
      failedIds: new Map(),
      debounceTimer: null,
      inFlight: false,
      failureLogged: false,
    };
    stateByRestaurant.set(restaurantId, state);
  }
  return state;
}

function devLog(message: string, detail?: Record<string, unknown>): void {
  if (__DEV__) {
    console.log('[orderCleanup]', message, detail ?? '');
  }
}

function isFailedBackoffActive(entry: FailedEntry | undefined, now: number): boolean {
  return entry != null && now < entry.retryAfterMs;
}

function markBatchFailure(state: RestaurantCleanupState, orderIds: string[], now: number): void {
  state.lastFailureAt = now;
  for (const orderId of orderIds) {
    const prev = state.failedIds.get(orderId);
    const failCount = (prev?.failCount ?? 0) + 1;
    const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, failCount - 1));
    state.failedIds.set(orderId, { failCount, retryAfterMs: now + backoff });
    state.processedIds.delete(orderId);
  }
}

function buildVisibilityPatch(action: 'archive' | 'hide'): Record<string, unknown> {
  const now = serverTimestamp();
  if (action === 'archive') {
    return {
      archivedByRestaurant: true,
      hiddenForRestaurant: true,
      archivedAt: now,
      hiddenAt: now,
      updatedAt: now,
    };
  }
  return {
    hiddenForRestaurant: true,
    hiddenAt: now,
    updatedAt: now,
  };
}

async function flushCleanupBatch(
  restaurantId: string,
  entries: Array<{ orderId: string; action: 'archive' | 'hide' }>,
): Promise<string[]> {
  if (entries.length === 0) return [];

  const batch = writeBatch(db);
  for (const entry of entries) {
    batch.update(doc(db, 'orders', entry.orderId), buildVisibilityPatch(entry.action));
  }
  await batch.commit();

  const ids = entries.map((e) => e.orderId);
  devLog('batch committed', { restaurantId, count: ids.length, ids });
  return ids;
}

/**
 * Runs retention cleanup once per cooldown window (debounced, batched).
 * Safe to call from snapshot handlers — no-op when throttled.
 */
export function scheduleRestaurantOrderCleanup(
  restaurantId: string,
  orders: RestaurantOrder[],
): void {
  const rid = restaurantId.trim();
  if (!rid || orders.length === 0) return;

  const state = getState(rid);

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    void runRestaurantOrderCleanup(rid, orders);
  }, CLEANUP_DEBOUNCE_MS);
}

export async function runRestaurantOrderCleanup(
  restaurantId: string,
  orders: RestaurantOrder[],
): Promise<string[]> {
  const rid = restaurantId.trim();
  if (!rid) return [];

  const state = getState(rid);
  const now = Date.now();

  if (state.inFlight) {
    devLog('skip in-flight', { restaurantId: rid });
    return [];
  }

  if (now - state.lastRunAt < CLEANUP_COOLDOWN_MS) {
    devLog('skip cooldown', {
      restaurantId: rid,
      nextInMs: CLEANUP_COOLDOWN_MS - (now - state.lastRunAt),
    });
    return [];
  }

  const candidates: Array<{ orderId: string; action: 'archive' | 'hide' }> = [];

  for (const order of orders) {
    if (candidates.length >= MAX_BATCH_WRITES) break;
    if (order.restaurantId !== rid) continue;

    const failed = state.failedIds.get(order.id);
    if (isFailedBackoffActive(failed, now)) continue;
    if (state.processedIds.has(order.id)) continue;

    const action = shouldAutoArchiveOrder(order, now);
    if (!action) continue;

    candidates.push({ orderId: order.id, action });
  }

  if (candidates.length === 0) {
    state.lastRunAt = now;
    devLog('no candidates', { restaurantId: rid });
    return [];
  }

  for (const entry of candidates) {
    state.processedIds.add(entry.orderId);
  }

  state.inFlight = true;
  try {
    const updated = await flushCleanupBatch(rid, candidates);
    for (const id of updated) {
      state.failedIds.delete(id);
    }
    state.lastRunAt = Date.now();
    state.failureLogged = false;
    return updated;
  } catch (error) {
    markBatchFailure(state, candidates.map((c) => c.orderId), now);
    if (__DEV__ && !state.failureLogged) {
      state.failureLogged = true;
      console.warn('[orderCleanup] batch failed (will backoff)', {
        restaurantId: rid,
        count: candidates.length,
        error,
      });
    }
    return [];
  } finally {
    state.inFlight = false;
  }
}

/** Clears throttle state when restaurant session ends (e.g. sign-out). */
export function resetRestaurantOrderCleanupState(restaurantId?: string): void {
  if (restaurantId) {
    const state = stateByRestaurant.get(restaurantId);
    if (state?.debounceTimer) clearTimeout(state.debounceTimer);
    stateByRestaurant.delete(restaurantId);
    return;
  }
  for (const state of stateByRestaurant.values()) {
    if (state.debounceTimer) clearTimeout(state.debounceTimer);
  }
  stateByRestaurant.clear();
}
