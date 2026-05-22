import type { UserRole } from '@/services/userService';

/** True only at the app entry route — not inside role shells (driver, tabs, etc.). */
export function isAtAppEntryPoint(pathname: string, segments: string[]): boolean {
  if (pathname !== '/' && pathname !== '/index') {
    return false;
  }

  const root = segments[0];
  if (
    root === '(tabs)' ||
    root === '(driver)' ||
    root === '(host)' ||
    root === '(auth)' ||
    root === '(customer)' ||
    root === '(restaurant)'
  ) {
    return false;
  }

  // Expo Router can report pathname `/` while a shell is active — extra guards.
  if (
    pathname.includes('(driver)') ||
    pathname.includes('(tabs)') ||
    pathname.includes('(host)') ||
    pathname.startsWith('/driver')
  ) {
    return false;
  }

  return true;
}

export function roleLandingKey(uid: string, role: UserRole): string {
  return `${uid}:${role}`;
}
