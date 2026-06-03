import type { UserRole } from '@/services/userService';

import { runSilentAccountLocationReconcile } from './accountLocationReconcile';

function appLaunchGpsSessionKey(uid: string): string {
  return `app_launch:gps_reconcile:${uid.trim()}`;
}

export type AppLaunchLocationParams = {
  uid: string;
  role: UserRole | null;
  restaurantId?: string | null;
};

/** Once per app session after sign-in. */
export async function runAppLaunchLocationReconcile(
  params: AppLaunchLocationParams,
): Promise<void> {
  const uid = params.uid.trim();
  if (!uid) return;
  await runSilentAccountLocationReconcile(
    params,
    appLaunchGpsSessionKey(uid),
    'app_launch',
  );
}
