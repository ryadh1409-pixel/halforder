import { doc, getDoc } from 'firebase/firestore';

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
import { resolveProductionGpsSavedLocation } from './productionGps';
import {
  fetchSavedLocationFromServer,
  saveAccountSavedLocation,
} from './savedLocationFirestore';

function appLaunchGpsSessionKey(uid: string): string {
  return `app_launch:gps_reconcile:${uid.trim()}`;
}

export type AppLaunchLocationParams = {
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

function buildReconcileTargets(params: AppLaunchLocationParams): ReconcileTarget[] {
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

async function readRestaurantIdForUser(uid: string): Promise<string | null> {
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
 * Once per app session after sign-in: one fresh GPS read, compare to Firestore saved
 * locations, auto-update when moved ≥ 1 km or city changed. Skips on simulator (production)
 * and when GPS is denied/unavailable (never overwrites with stale cache).
 */
export async function runAppLaunchLocationReconcile(
  params: AppLaunchLocationParams,
): Promise<void> {
  const uid = params.uid.trim();
  if (!uid) return;
  if (!claimGpsRefreshSession(appLaunchGpsSessionKey(uid))) return;

  let restaurantId = params.restaurantId?.trim() || null;
  if (!restaurantId && (params.role === 'restaurant' || params.role === 'host')) {
    restaurantId = await readRestaurantIdForUser(uid);
  }

  let gpsLocation;
  try {
    const result = await resolveProductionGpsSavedLocation({ forceFresh: true });
    gpsLocation = result.location;
    console.log('[APP LAUNCH GPS]', {
      latitude: result.reading.latitude,
      longitude: result.reading.longitude,
      city: gpsLocation.city,
      accuracy: result.reading.accuracy,
    });
  } catch (e) {
    console.log('[APP LAUNCH GPS]', {
      skipped: true,
      reason: e instanceof Error ? e.message : 'unavailable',
    });
    return;
  }

  const targets = buildReconcileTargets({ ...params, restaurantId });

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

      const kmMoved =
        server.location.latitude !== gpsLocation.latitude ||
        server.location.longitude !== gpsLocation.longitude;

      await saveAccountSavedLocation(
        target.collection,
        target.accountId,
        gpsLocation,
        { role: target.role },
      );

      logRoleGps(target.role, 'app_launch_auto_replace', {
        collection: target.collection,
        accountId: target.accountId,
        oldCity: server.location.city,
        newCity: gpsLocation.city,
        moved: kmMoved,
      });
      console.log('[PROFILE LOCATION UPDATED]', {
        source: 'app_launch',
        role: target.role,
        logTag: config.logTag,
        city: gpsLocation.city,
      });
    } catch (err) {
      console.log('[APP LAUNCH GPS]', {
        target: target.collection,
        accountId: target.accountId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
