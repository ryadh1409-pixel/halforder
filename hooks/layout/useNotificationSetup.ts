import {
  HALF_ORDER_PAIR_JOIN_PUSH_TYPE,
  type AppNotificationPayload,
  type NearbyMatchPayload,
} from '@/types/notification';
import {
  PAYMENT_MATCH_ALERT_MESSAGE,
  PAYMENT_MATCH_ALERT_TITLE,
} from '@/constants/paymentDisclaimer';
import {
  logNotificationOpened,
  logNotificationReceived,
} from '@/services/notificationTracking';
import {
  configureExpoPushNotificationHandler,
  requestNotificationPermissionOnAppLaunch,
} from '@/services/pushNotifications';
import { trackNotificationOpen } from '@/services/analytics';
import { showNotice } from '@/utils/toast';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, type MutableRefObject } from 'react';
import { Platform } from 'react-native';

const NEARBY_MATCH_DATA_TYPE = 'nearby_match';

configureExpoPushNotificationHandler();

export function useNotificationSetup(
  currentUserRef: MutableRefObject<{ uid?: string | null } | null>,
) {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    requestNotificationPermissionOnAppLaunch().catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const receivedSub = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = (notification?.request?.content?.data ??
          {}) as AppNotificationPayload;
        if (data.type === HALF_ORDER_PAIR_JOIN_PUSH_TYPE) {
          showNotice(PAYMENT_MATCH_ALERT_TITLE, PAYMENT_MATCH_ALERT_MESSAGE);
        }
        const notificationId =
          typeof data.notificationId === 'string' ? data.notificationId : null;
        if (notificationId) {
          logNotificationReceived(notificationId).catch(() => {});
        }
      },
    );
    return () => receivedSub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const responseSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = (response.notification?.request?.content?.data ??
          {}) as AppNotificationPayload;
        const fromData =
          typeof data.notificationId === 'string' ? data.notificationId : null;
        const notificationId = fromData ?? response.notification?.request?.identifier ?? null;
        if (notificationId) {
          logNotificationOpened(notificationId).catch(() => {});
        }
        trackNotificationOpen(
          currentUserRef.current?.uid ?? null,
          notificationId,
        ).catch(() => {});
        if ((data as NearbyMatchPayload).type === NEARBY_MATCH_DATA_TYPE) {
          router.push('/(tabs)' as never);
          return;
        }
        if (
          data.type === HALF_ORDER_PAIR_JOIN_PUSH_TYPE &&
          typeof data.orderId === 'string'
        ) {
          router.push(`/order/${data.orderId}` as never);
        }
      },
    );
    return () => responseSub.remove();
  }, [currentUserRef, router]);
}
