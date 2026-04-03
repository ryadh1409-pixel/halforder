/**
 * Resolve Expo push tokens + optional targeting for admin broadcast sends.
 */
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

import { haversineDistanceKm, type LatLng } from '@/services/haversineKm';

export type AdminBroadcastTargetMode = 'all' | 'active_users';

const ACTIVE_ROLLING_MS = 24 * 60 * 60 * 1000;

/** Expo push tokens normally look like ExponentPushToken[...]. */
export function isLikelyExpoPushToken(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 24) return false;
  return t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[');
}

export function expoTokenFromUserFields(data: Record<string, unknown>): string | null {
  const candidates = [
    data.expoPushToken,
    data.pushToken,
    data.fcmToken,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && isLikelyExpoPushToken(c)) return c.trim();
  }
  return null;
}

function lastActiveMs(data: Record<string, unknown>): number | null {
  const la = data.lastActive;
  if (la && typeof la === 'object' && la !== null && 'toMillis' in la) {
    const ms = (la as { toMillis?: () => number }).toMillis?.();
    if (typeof ms === 'number' && Number.isFinite(ms)) return ms;
  }
  if (
    typeof data.lastActive === 'number' &&
    Number.isFinite(data.lastActive)
  ) {
    return data.lastActive;
  }
  return null;
}

export function userLatLngFromDoc(data: Record<string, unknown>): LatLng | null {
  const latRaw =
    typeof data.latitude === 'number'
      ? data.latitude
      : data.location &&
          typeof data.location === 'object' &&
          data.location !== null &&
          'latitude' in data.location
        ? (data.location as { latitude?: unknown }).latitude
        : null;
  const lngRaw =
    typeof data.longitude === 'number'
      ? data.longitude
      : data.location &&
          typeof data.location === 'object' &&
          data.location !== null &&
          'longitude' in data.location
        ? (data.location as { longitude?: unknown }).longitude
        : null;
  const lat = typeof latRaw === 'number' ? latRaw : NaN;
  const lng = typeof lngRaw === 'number' ? lngRaw : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export type CollectRecipientsOptions = {
  targetMode: AdminBroadcastTargetMode;
  /** When set > 0, require user coords within this distance of `center`. */
  radiusKm?: number | null;
  center?: LatLng | null;
  nowMs?: number;
};

/**
 * Returns deduped Expo push tokens from user documents.
 */
export function collectBroadcastRecipientTokens(
  snapshots: QueryDocumentSnapshot<DocumentData>[],
  options: CollectRecipientsOptions,
): { tokens: string[]; skippedNoToken: number; skippedFilter: number } {
  const now = options.nowMs ?? Date.now();
  const activeCutoff = now - ACTIVE_ROLLING_MS;
  const radius =
    typeof options.radiusKm === 'number' &&
    options.radiusKm > 0 &&
    options.center
      ? options.radiusKm
      : null;
  const center = radius ? options.center : null;

  const tokenSet = new Set<string>();
  let skippedNoToken = 0;
  let skippedFilter = 0;

  for (const snap of snapshots) {
    const raw = snap.data() as Record<string, unknown>;

    if (options.targetMode === 'active_users') {
      const la = lastActiveMs(raw);
      if (la == null || la < activeCutoff) {
        skippedFilter += 1;
        continue;
      }
    }

    if (radius != null && center) {
      const ll = userLatLngFromDoc(raw);
      if (!ll) {
        skippedFilter += 1;
        continue;
      }
      const km = haversineDistanceKm(center, ll);
      if (!Number.isFinite(km) || km > radius) {
        skippedFilter += 1;
        continue;
      }
    }

    const tok = expoTokenFromUserFields(raw);
    if (!tok) {
      skippedNoToken += 1;
      continue;
    }
    tokenSet.add(tok);
  }

  return {
    tokens: [...tokenSet],
    skippedNoToken,
    skippedFilter,
  };
}
