import { getRouteForRole, normalizeRoleForRouting } from '@/lib/authRole';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { logRedirectDecision } from '@/utils/driverLifecycleLog';
import { usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export type RoleShell = 'driver' | 'host';

function isRoleAllowedForShell(shell: RoleShell, role: ReturnType<typeof normalizeRoleForRouting>): boolean {
  if (shell === 'driver') return role === 'driver';
  return role === 'restaurant';
}

function shellLabel(shell: RoleShell): string {
  return shell === 'driver' ? '(driver)' : '(host)';
}

type Props = {
  shell: RoleShell;
  children: React.ReactNode;
};

/**
 * Blocks provider trees until auth + role are resolved and match the route shell.
 * Wrong-role users are replaced away before children mount.
 */
export function RoleShellLayoutGuard({ shell, children }: Props) {
  const { user, loading, authReady, roleResolved, firestoreUserRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const redirectLatch = useRef(false);

  const ready = authReady && roleResolved && !loading;
  const signedIn = isRegisteredAuthUser(user);
  const role = normalizeRoleForRouting(firestoreUserRole);
  const allowed = signedIn && isRoleAllowedForShell(shell, role);

  useEffect(() => {
    if (!ready) return;
    if (allowed) return;

    const target = !signedIn ? '/(auth)/login' : getRouteForRole(role);
    if (redirectLatch.current) return;
    redirectLatch.current = true;

    if (__DEV__) {
      console.warn('[Route shell guard] role/group mismatch — redirecting', {
        shell: shellLabel(shell),
        role,
        pathname,
        segments,
        target,
      });
    }

    logRedirectDecision({
      guard: 'RoleShellLayoutGuard',
      action: 'redirect',
      from: pathname,
      to: target,
      reason: `wrong-role-for-${shell}-shell`,
      role,
      segments: segments as string[],
    });

    router.replace(target as never);
  }, [allowed, pathname, ready, role, router, segments, shell, signedIn]);

  if (!ready) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={shell === 'driver' ? '#22C55E' : '#16a34a'} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={shell === 'driver' ? '#22C55E' : '#16a34a'} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
