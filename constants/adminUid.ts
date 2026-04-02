/**
 * Firebase Auth uid for the admin account. Must match `isAdmin()` in
 * `firestore.rules`.
 */
export const ADMIN_UID = 'KT3LfXRsVgaH4LfRTQaexvj3CRn1';

export function isAdminUser(user: { uid: string } | null | undefined): boolean {
  return !!user && user.uid === ADMIN_UID;
}
