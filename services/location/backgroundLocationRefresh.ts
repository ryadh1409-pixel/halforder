import type { AppLaunchLocationParams } from './appLaunchLocationReconcile';
import { runSilentAccountLocationReconcile } from './accountLocationReconcile';

/** Refresh saved profile when app was backgrounded longer than this. */
export const BACKGROUND_GPS_REFRESH_AFTER_MS = 5 * 60 * 1000;

let lastBackgroundedAtMs: number | null = null;

export function markAppBackgrounded(): void {
  lastBackgroundedAtMs = Date.now();
}

export function clearBackgroundTimestamp(): void {
  lastBackgroundedAtMs = null;
}

export function backgroundDurationMs(): number | null {
  if (lastBackgroundedAtMs == null) return null;
  return Date.now() - lastBackgroundedAtMs;
}

function backgroundReconcileSessionKey(uid: string, backgroundedAtMs: number): string {
  return `background_return:${uid.trim()}:${backgroundedAtMs}`;
}

/**
 * After >5 min in background: one silent fresh GPS reconcile (same rules as launch).
 */
export async function runBackgroundLocationRefresh(
  params: AppLaunchLocationParams,
): Promise<void> {
  const uid = params.uid.trim();
  if (!uid) return;

  const duration = backgroundDurationMs();
  if (duration == null || duration < BACKGROUND_GPS_REFRESH_AFTER_MS) {
    return;
  }

  const backgroundedAt = lastBackgroundedAtMs ?? Date.now();
  clearBackgroundTimestamp();

  await runSilentAccountLocationReconcile(
    params,
    backgroundReconcileSessionKey(uid, backgroundedAt),
    'background_return',
  );
}
