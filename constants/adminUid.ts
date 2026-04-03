/**
 * Firebase Auth uid for the admin account. Must match `isAdmin()` in
 * `firestore.rules`.
 */
export const ADMIN_UID = 'KT3LfXRsVgaH4LfRTQaexvj3CRn1';

/** Email admins may sign in with (must match Storage/Firestore rules). */
export const ADMIN_PANEL_EMAIL = 'admin@yourapp.com';

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isAdminUser(
  user: { uid: string; email?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.uid === ADMIN_UID) return true;
  return normalizeEmail(user.email) === ADMIN_PANEL_EMAIL;
}
