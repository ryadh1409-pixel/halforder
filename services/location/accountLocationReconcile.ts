import { doc, getDoc } from 'firebase/firestore';

import { logLocationDebug } from '@/lib/location/locationDebugLog';
import { savedLocationShouldBeReplacedByGps } from '@/lib/location/savedLocationReconcile';
import {
  getAccountLocationRoleConfig,
  logRoleGps,
  type AccountLocationRole,
} from '@/services/location/accountLocationRole';
import { db } from '@/services/firebase';
import type { UserRole } from '@/services/userService';
import type { AccountLocationCollection } from '@/types/savedLocation';

import { claimGpsRefreshSession } from './gpsSession';
import { runDedupedGpsRequest } from './gpsRequestGate';
import { resolveProductionGpsSavedLocation } from './productionGps';
import {
  fetchSavedLocationFromServer,
  saveAccountSavedLocation,
} from './savedLocationFirestore';

export type AccountLocationReconcileParams = {
  uid: string;
  role: UserRole | null;
  restaurantId?: string | null;
};

type ReconcileTarget = {
  collection: AccountLocationCollection;
  accountId: string;
  role: AccountLocationRole;
};

function mapUserRoleToLocationRole(role: UserRole | null): AccountLocationRole {
  if (role === 'driver') return 'driver';
  if (role === 'restaurant' || role === 'host') return 'restaurant';
  return 'user';
}

export function buildAccountLocationReconcileTargets(
  params: AccountLocationReconcileParams,
): ReconcileTarget[] {
  const uid = params.uid.trim();
  if (!uid) return [];

  const activeRole = mapUserRoleToLocationRole(params.role);
  const targets: ReconcileTarget[] = [
    { collection: 'users', accountId: uid, role: 'user' },
  ];

  if (activeRole === 'driver') {
    targets.push({ collection: 'drivers', accountId: uid, role: 'driver' });
  }
  if (activeRole === 'restaurant') {
    const restaurantId = (params.restaurantId ?? uid).trim();
    if (restaurantId) {
      targets.push({
        collection: 'restaurants',
        accountId: restaurantId,
        role: 'restaurant',
      });
    }
  }

  return targets;
}

export async function readRestaurantIdForUser(uid: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const raw = snap.data()?.restaurantId;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Silent fresh GPS + Firestore update when device moved ≥ 1 km or city changed.
 * Skips when GPS unavailable (never overwrites with stale cache).
 */
export async function runSilentAccountLocationReconcile(
  params: AccountLocationReconcileParams,
  sessionKey: string,
  source: 'app_launch' | 'background_return',
): Promise<void> {
  const uid = params.uid.trim();
  if (!uid) return;
  if (!claimGpsRefreshSession(sessionKey)) return;

  let restaurantId = params.restaurantId?.trim() || null;
  if (!restaurantId && (params.role === 'restaurant' || params.role === 'host')) {
    restaurantId = await readRestaurantIdForUser(uid);
  }

  let gpsLocation;
  try {
    const result = await runDedupedGpsRequest(
      `silent_reconcile:${uid}`,
      () => resolveProductionGpsSavedLocation({ forceFresh: true }),
    );
    gpsLocation = result.location;
    logLocationDebug('[SILENT GPS RECONCILE]', {
      source,
      latitude: result.reading.latitude,
      longitude: result.reading.longitude,
      city: gpsLocation.city,
    });
  } catch (e) {
    logLocationDebug('[SILENT GPS RECONCILE]', {
      source,
      skipped: true,
      reason: e instanceof Error ? e.message : 'unavailable',
    });
    return;
  }

  const targets = buildAccountLocationReconcileTargets({ ...params, restaurantId });

  for (const target of targets) {
    const config = getAccountLocationRoleConfig(target.role);
    try {
      const server = await fetchSavedLocationFromServer(
        target.collection,
        target.accountId,
      );
      if (
        !server.location ||
        !savedLocationShouldBeReplacedByGps(server.location, gpsLocation)
      ) {
        continue;
      }

      await saveAccountSavedLocation(
        target.collection,
        target.accountId,
        gpsLocation,
        { role: target.role },
      );

      logRoleGps(target.role, `${source}_auto_replace`, {
        collection: target.collection,
        accountId: target.accountId,
        oldCity: server.location.city,
        newCity: gpsLocation.city,
      });
      logLocationDebug('[PROFILE LOCATION UPDATED]', {
        source,
        role: target.role,
        logTag: config.logTag,
        city: gpsLocation.city,
      });
    } catch (err) {
      logLocationDebug('[SILENT GPS RECONCILE]', {
        source,
        target: target.collection,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
