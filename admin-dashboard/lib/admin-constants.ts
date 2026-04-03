/** Single allowed admin email (must match Firestore / Storage rules). */
export const ADMIN_EMAIL = 'admin@ourfood.com';

export function isAdminEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === ADMIN_EMAIL;
}
