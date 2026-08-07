/**
 * useIWantFeatureFlag — access control for "I Want Something".
 *
 * Currently ADMIN-ONLY (internal testing).
 * To release publicly, flip PUBLIC_ENABLED to true — no other changes needed.
 *
 * Relies on the existing HalfOrder admin role system (isAdminUser).
 * Does NOT introduce a new auth mechanism.
 */

import { isAdminUser } from '@/constants/adminUid';
import { useAuth } from '@/services/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// RELEASE FLAG — flip this ONE constant to enable for all users.
// false = admin testing only (current)
// true  = public release
// ─────────────────────────────────────────────────────────────────────────────
const PUBLIC_ENABLED = false;

export type IWantFeatureFlag = {
  /** Whether the current user may access "I Want Something". */
  enabled: boolean;
  /** True while the user's role is still being resolved from Firestore. */
  loading: boolean;
};

/**
 * Returns whether the current user has access to "I Want Something".
 *
 * - If PUBLIC_ENABLED is true: everyone has access.
 * - If PUBLIC_ENABLED is false: only admin accounts have access.
 *
 * `loading` is true while the Firestore role subscription hasn't settled yet
 * — route guards must wait for loading=false before redirecting, so admins
 * aren't kicked out before their role resolves.
 */
export function useIWantFeatureFlag(): IWantFeatureFlag {
  const { user, firestoreUserRole, roleResolved } = useAuth();

  if (PUBLIC_ENABLED) {
    return { enabled: true, loading: false };
  }

  // While Firestore role hasn't been read yet, treat as loading (not denied).
  // This prevents flashing a redirect for admins whose role takes a tick to load.
  if (!roleResolved) {
    return { enabled: false, loading: true };
  }

  const enabled = isAdminUser(user, firestoreUserRole);
  return { enabled, loading: false };
}
