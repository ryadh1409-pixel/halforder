import { isAdminUser } from '@/constants/adminUid';
import { normalizeReturnPathAfterTerms } from '@/constants/termsAcceptance';
import { userNeedsEmailVerification } from '@/lib/authEmailVerification';
import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

export function useAuthRedirect(args: {
  user: { uid?: string | null } | null;
  authLoading: boolean;
  firestoreUserRole: string | null | undefined;
  termsFirestoreReady: boolean;
  hasAcceptedTermsFs: boolean;
}) {
  const {
    user,
    authLoading,
    firestoreUserRole,
    termsFirestoreReady,
    hasAcceptedTermsFs,
  } = args;
  const router = useRouter();
  const segments = useSegments();
  const seg0 = segments[0] as string | undefined;
  const pathname = segments.length > 0 ? `/${segments.join('/')}` : '';

  useEffect(() => {
    const inAuthGroup = seg0 === '(auth)';
    const onJoinRedirect = seg0 === 'join';
    const onPublicShellRoutes =
      seg0 === 'terms-acceptance' ||
      seg0 === 'terms' ||
      seg0 === 'privacy' ||
      seg0 === 'subscribe' ||
      seg0 === 'safety' ||
      seg0 === 'safety-community-guidelines';

    const isAdminPath =
      seg0 === 'admin' ||
      seg0 === 'admin-users' ||
      seg0 === 'admin-orders' ||
      seg0 === 'admin-user' ||
      seg0 === 'admin-order' ||
      seg0 === 'admin-notifications' ||
      seg0 === 'admin-reports' ||
      seg0 === 'admin-support';

    if (!user && !inAuthGroup && !onJoinRedirect && !onPublicShellRoutes) {
      const loginHref =
        pathname && pathname !== '/'
          ? `/(auth)/login?redirectTo=${encodeURIComponent(pathname)}`
          : '/(auth)/login';
      router.replace(loginHref as never);
      return;
    }

    const emailNotVerified =
      Boolean(user) && userNeedsEmailVerification(user as never);
    if (emailNotVerified && seg0 !== 'verify-email' && !onPublicShellRoutes) {
      router.replace('/verify-email' as never);
      return;
    }

    if (user && inAuthGroup && !emailNotVerified) {
      router.replace('/(tabs)' as never);
      return;
    }

    if (
      !authLoading &&
      user &&
      !isAdminUser(user as never, firestoreUserRole) &&
      isAdminPath
    ) {
      router.replace('/(tabs)' as never);
      return;
    }

    if (
      !authLoading &&
      user &&
      termsFirestoreReady &&
      !hasAcceptedTermsFs &&
      !onPublicShellRoutes
    ) {
      const ret = normalizeReturnPathAfterTerms(
        pathname && pathname !== '/' ? pathname : '/(tabs)',
      );
      router.replace(
        `/terms-acceptance?returnTo=${encodeURIComponent(ret)}` as never,
      );
    }
  }, [
    authLoading,
    firestoreUserRole,
    hasAcceptedTermsFs,
    pathname,
    router,
    seg0,
    termsFirestoreReady,
    user,
  ]);
}
