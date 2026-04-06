import type { User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

import { db } from '@/services/firebase';

/** Emails that always receive `role: admin` on sync (lowercased when checked). */
export const ADMIN_EMAILS = [
  'support@halforder.app',
  'ryadh1409@gmail.com',
] as const;

function normalizeAdminEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email?.trim()) return false;
  return (ADMIN_EMAILS as readonly string[]).includes(normalizeAdminEmail(email));
}

/**
 * Writes `email` and, for whitelist emails, `role: admin` to Firestore.
 * Does not set `role: user` for other accounts so promoted admins stay valid until demoted.
 */
export async function syncUserRoleToFirestore(user: User): Promise<void> {
  if (!user.uid || user.isAnonymous) return;
  const payload: Record<string, unknown> = {};
  if (user.email) {
    payload.email = user.email;
  }
  if (isAdminEmail(user.email)) {
    payload.role = 'admin';
  }
  if (Object.keys(payload).length === 0) return;
  await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
}
