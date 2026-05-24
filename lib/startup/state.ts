/**
 * Session-scoped startup navigation state.
 * No routing/hydration imports — safe for any layer to reset or read.
 */

/** Set after first successful landing into a role shell. */
let roleShellLandingComplete = false;

/** Completed `router.replace` targets — dedupe navigation. */
export const completedRedirects = new Set<string>();

/** Completed role landing per uid+role. */
export const completedRoleRedirects = new Set<string>();

export function markRoleShellLandingComplete(): void {
  roleShellLandingComplete = true;
}

export function hasRoleShellLandingCompleted(): boolean {
  return roleShellLandingComplete;
}

export function resetRoleShellLanding(): void {
  roleShellLandingComplete = false;
}

export function markRedirectCompleted(targetRoute: string, sessionKey?: string): void {
  completedRedirects.add(targetRoute);
  if (sessionKey) {
    completedRoleRedirects.add(sessionKey);
  }
  markRoleShellLandingComplete();
}

export function hasRedirectCompleted(targetRoute: string): boolean {
  return completedRedirects.has(targetRoute);
}

export function clearStartupNavigationState(): void {
  completedRedirects.clear();
  completedRoleRedirects.clear();
  resetRoleShellLanding();
}
