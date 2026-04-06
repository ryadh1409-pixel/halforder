import type { User } from 'firebase/auth';

/** Email/password accounts must verify; phone-only users have no email. */
export function userNeedsEmailVerification(user: User | null): boolean {
  if (!user || user.isAnonymous) return false;
  return Boolean(user.email && !user.emailVerified);
}
