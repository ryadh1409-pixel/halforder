import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

/** Legacy driver route — unified marketplace orders live at `/order/[id]`. */
export default function DriverOrderLegacyRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const oid = typeof id === 'string' ? id.trim() : '';

  useEffect(() => {
    if (!oid) {
      router.replace('/(driver)' as never);
      return;
    }
    router.replace(`/order/${encodeURIComponent(oid)}` as never);
  }, [oid]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' }}>
      <ActivityIndicator size="large" color="#22C55E" />
    </View>
  );
}
