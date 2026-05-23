import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import { isInDriverGroup } from '@/lib/driverRouteUtils';
import { logRedirectDecision } from '@/utils/driverLifecycleLog';
import { router, useLocalSearchParams, usePathname, useSegments } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

/** Legacy driver route — unified marketplace orders live at `/order/[id]`. */
export default function DriverOrderLegacyRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const pathname = usePathname();
  const segments = useSegments();
  const redirectedRef = useRef(false);
  const oid = typeof id === 'string' ? id.trim() : '';

  useEffect(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;

    if (!oid) {
      if (!isInDriverGroup(segments as string[], pathname)) {
        logRedirectDecision({
          guard: 'DriverOrderLegacyRedirect',
          action: 'redirect',
          from: pathname,
          to: DRIVER_ROUTES.hub,
          reason: 'missing-order-id',
          segments: segments as string[],
        });
        router.replace(DRIVER_ROUTES.hub as never);
      }
      return;
    }

    const target = `/order/${encodeURIComponent(oid)}`;
    logRedirectDecision({
      guard: 'DriverOrderLegacyRedirect',
      action: 'redirect',
      from: pathname,
      to: target,
      reason: 'legacy-driver-order-to-marketplace',
      segments: segments as string[],
    });
    router.replace(target as never);
  }, [oid, pathname, router, segments]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' }}>
      <ActivityIndicator size="large" color="#22C55E" />
    </View>
  );
}
