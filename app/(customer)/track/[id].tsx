import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Legacy route — canonical DoorDash-style tracking is `/track-order/[orderId]`. */
export default function CustomerLiveTrackRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id.trim() : '';

  useEffect(() => {
    if (!orderId) {
      router.replace('/(tabs)/orders' as never);
      return;
    }
    router.replace(`/track-order/${encodeURIComponent(orderId)}` as never);
  }, [orderId]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF3008" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
