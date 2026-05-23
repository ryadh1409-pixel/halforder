/**
 * Driver stack latch — set when `app/(driver)/_layout` has mounted at least once.
 *
 * We intentionally do NOT clear this in layout cleanup: Expo Router and React StrictMode
 * (dev) can unmount/remount the layout once during hydration. Clearing on cleanup made
 * RoleRouteGuard think the stack was gone and fire a second `router.replace('/(driver)')`.
 *
 * Reset only on sign-out via `resetDriverStackLatch()` (called from clearRoleRedirectGuards).
 */
let driverStackLatched = false;

export function markDriverStackMounted(): void {
  driverStackLatched = true;
}

/** @deprecated No-op — use resetDriverStackLatch on sign-out only. */
export function clearDriverStackMounted(): void {
  // Intentionally empty — see module comment.
}

export function resetDriverStackLatch(): void {
  driverStackLatched = false;
}

export function isDriverStackMounted(): boolean {
  return driverStackLatched;
}
