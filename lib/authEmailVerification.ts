import type { User } from 'firebase/auth';

/**
 * HalfOrder no longer requires email verification before app access.
 * Password-reset and other auth emails still use Firebase Auth templates.
 */
export function userNeedsEmailVerification(_user: User | null): boolean {
  return false;
}
