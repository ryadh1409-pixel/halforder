/**
 * Global bridge: remote/local critical pushes start the looping alarm;
 * notification taps and role lifecycle acks stop it.
 *
 * Mount once from the root layout (outside Expo Go / web).
 */
import {
  RESTAURANT_NEW_ORDER_PUSH_TYPE,
  DRIVER_READY_FOR_PICKUP_PUSH_TYPE,
  ADMIN_NEW_ORDER_PUSH_TYPE,
} from '@/constants/pushTypes';
import {
  startCriticalOrderAlert,
  stopCriticalOrderAlert,
  stopCriticalOrderAlertsForOrder,
  type OrderAlertEvent,
  type OrderAlertRole,
} from '@/services/orderCriticalAlert';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { isExpoGo } from '@/constants/runtimeEnvironment';

function roleEventFromData(
  data: Record<string, unknown> | undefined,
): { role: OrderAlertRole; event: OrderAlertEvent; orderId: string } | null {
  if (!data) return null;
  const orderId =
    typeof data.orderId === 'string'
      ? data.orderId.trim()
      : typeof data.alertKey === 'string' && data.alertKey.includes(':')
        ? data.alertKey.split(':').slice(2).join(':')
        : '';
  if (!orderId) return null;

  const type = typeof data.type === 'string' ? data.type.trim() : '';
  if (type === 'critical_order_alert') {
    const role = data.role as OrderAlertRole;
    const event = data.event as OrderAlertEvent;
    if (
      (role === 'admin' || role === 'restaurant' || role === 'driver') &&
      (event === 'new_order' ||
        event === 'ready_for_pickup' ||
        event === 'new_delivery_available')
    ) {
      return { role, event, orderId };
    }
  }
  if (type === RESTAURANT_NEW_ORDER_PUSH_TYPE) {
    return { role: 'restaurant', event: 'new_order', orderId };
  }
  if (type === ADMIN_NEW_ORDER_PUSH_TYPE || type === 'admin_order_alarm') {
    return { role: 'admin', event: 'new_order', orderId };
  }
  if (type === DRIVER_READY_FOR_PICKUP_PUSH_TYPE) {
    return { role: 'driver', event: 'ready_for_pickup', orderId };
  }
  return null;
}

function titleBodyFor(
  role: OrderAlertRole,
  event: OrderAlertEvent,
  fallbackTitle?: string,
  fallbackBody?: string,
): { title: string; body: string } {
  if (fallbackTitle && fallbackBody) {
    return { title: fallbackTitle, body: fallbackBody };
  }
  if (role === 'restaurant' && event === 'new_order') {
    return {
      title: 'New Order Received',
      body: 'Tap to accept or reject the order.',
    };
  }
  if (role === 'admin' && event === 'new_order') {
    return {
      title: 'New Paid Order',
      body: 'Open the order to review details.',
    };
  }
  if (role === 'driver' && event === 'ready_for_pickup') {
    return {
      title: 'Order Ready for Pickup',
      body: 'Restaurant marked the order ready.',
    };
  }
  return { title: 'Order Alert', body: 'Open HalfOrder to continue.' };
}

export function OrderCriticalAlertBridge() {
  useEffect(() => {
    if (Platform.OS === 'web' || isExpoGo) return;

    const received = Notifications.addNotificationReceivedListener((n) => {
      const content = n.request.content;
      const data = (content.data ?? {}) as Record<string, unknown>;
      const parsed = roleEventFromData(data);
      if (!parsed) return;
      const { title, body } = titleBodyFor(
        parsed.role,
        parsed.event,
        content.title ?? undefined,
        content.body ?? undefined,
      );
      void startCriticalOrderAlert({
        role: parsed.role,
        event: parsed.event,
        orderId: parsed.orderId,
        title,
        body,
        // Remote/local OS banner already presented — do not schedule another.
        presentLocalNotification: false,
      });
    });

    const response = Notifications.addNotificationResponseReceivedListener(
      (res) => {
        const data = (res.notification.request.content.data ?? {}) as Record<
          string,
          unknown
        >;
        const parsed = roleEventFromData(data);
        if (!parsed) {
          const orderId =
            typeof data.orderId === 'string' ? data.orderId.trim() : '';
          if (orderId) void stopCriticalOrderAlertsForOrder(orderId, 'ack');
          return;
        }
        void stopCriticalOrderAlert({
          role: parsed.role,
          event: parsed.event,
          orderId: parsed.orderId,
          reason: 'ack',
        });
      },
    );

    return () => {
      received.remove();
      response.remove();
    };
  }, []);

  return null;
}
