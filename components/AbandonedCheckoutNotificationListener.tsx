/**
 * Tracks abandoned-checkout local notification opens without altering
 * the shared push deep-link pipeline.
 */
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { bumpAbandonedCheckoutNotificationOpened } from '@/services/abandonedCheckoutService';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export function AbandonedCheckoutNotificationListener() {
  useEffect(() => {
    if (Platform.OS === 'web' || isExpoGo) return;

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = (response.notification.request.content.data ?? {}) as Record<
          string,
          unknown
        >;
        if (data.type !== 'abandoned_checkout') return;
        const orderId =
          typeof data.orderId === 'string' ? data.orderId.trim() : '';
        if (orderId) void bumpAbandonedCheckoutNotificationOpened(orderId);
      },
    );

    return () => sub.remove();
  }, []);

  return null;
}
