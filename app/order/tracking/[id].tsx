import { USER_ROUTES } from '@/lib/navigationPaths';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

/** Canonical tracking lives at `/order/[id]` — keep legacy URLs working (redirect in an effect, not during render). */
export default function LegacyOrderTrackingRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const oid = typeof id === 'string' ? id.trim() : '';

  useEffect(() => {
    if (!oid) {
      router.replace('/(tabs)/orders' as never);
      return;
    }
    router.replace(USER_ROUTES.order(oid) as never);
  }, [oid]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#09090B' }}>
      <ActivityIndicator size="large" color="#22C55E" />
    </View>
  );
}
