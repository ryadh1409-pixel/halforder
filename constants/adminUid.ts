import { isAdminEmail } from '../utils/admin';

/** Firebase Auth uids with admin access. Must match `isAdmin()` in `firestore.rules`. */
export const ADMIN_UIDS = [
  'KT3LfXRsVgaH4LfRTQaexvj3CRn1',
  'Gjj6x4OU4OQmsnplollo9PLLpxt2',
] as const;

/** @deprecated Use {@link ADMIN_UIDS} */
export const ADMIN_UID = ADMIN_UIDS[0];

/** Email admins may sign in with (must match Storage/Firestore rules). */
export const ADMIN_PANEL_EMAIL = 'admin@ourfood.com';

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/**
 * Client-side admin gate. Pass `firestoreRole` from `useAuth().firestoreUserRole`
 * so promoted `role: admin` accounts can open the panel without a whitelist email.
 */
export function isAdminUser(
  user: { uid: string; email?: string | null } | null | undefined,
  firestoreRole?: string | null,
): boolean {
  if (!user) return false;
  if (typeof firestoreRole === 'string' && firestoreRole.trim() === 'admin') {
    return true;
  }
  if ((ADMIN_UIDS as readonly string[]).includes(user.uid)) return true;
  if (normalizeEmail(user.email) === ADMIN_PANEL_EMAIL) return true;
  if (isAdminEmail(user.email)) return true;
  return false;
}
