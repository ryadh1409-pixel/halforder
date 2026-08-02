/**
 * AdminOrderAlarmListener
 *
 * Mount once inside the admin layout. When a new paid order arrives:
 *  1. Plays the chime sound (loops 3×)
 *  2. Fires a local push notification with order details
 *  3. Shows the red alarm modal with full order info
 *
 * Safe to mount even if notification permissions are denied — the modal
 * and sound still work as a fallback.
 */
import { AdminOrderAlarmModal } from '@/components/admin/AdminOrderAlarmModal';
import type { AlarmOrder } from '@/services/adminOrderAlarm';
import { subscribeAdminOrderAlarm } from '@/services/adminOrderAlarm';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

const CHIME = require('@/assets/sounds/new-order-chime.wav');
const MAX_QUEUED = 20;

async function playAlarmSound(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true, // rings even on silent mode
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
    });
    const { sound } = await Audio.Sound.createAsync(CHIME, {
      shouldPlay: true,
      volume: 1.0,
    });
    // Play 3 times then unload
    let plays = 0;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        plays += 1;
        if (plays < 3) {
          void sound.replayAsync();
        } else {
          void sound.unloadAsync();
        }
      }
    });
  } catch (e) {
    console.warn('[AdminOrderAlarm] sound error', e);
  }
}

async function fireLocalNotification(order: AlarmOrder): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const itemSummary =
      order.items.length > 0
        ? order.items
            .slice(0, 3)
            .map((it) => `${it.qty}× ${it.name}`)
            .join(', ') + (order.items.length > 3 ? '…' : '')
        : `${order.itemCount} items`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🔴 New Order — CA$${order.totalPrice.toFixed(2)}`,
        body: [
          order.customerName ?? 'Customer',
          order.customerPhone ? `📞 ${order.customerPhone}` : null,
          order.deliveryType === 'delivery'
            ? `📍 ${order.deliveryAddress ?? 'Delivery'}`
            : '🏃 Pickup',
          itemSummary,
        ]
          .filter(Boolean)
          .join('\n'),
        sound: 'default',
        badge: 1,
        data: { orderId: order.orderId, type: 'admin_order_alarm' },
      },
      trigger: null, // fire immediately
    });
  } catch (e) {
    console.warn('[AdminOrderAlarm] notification error', e);
  }
}

export function AdminOrderAlarmListener() {
  const [pendingOrders, setPendingOrders] = useState<AlarmOrder[]>([]);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const handleNewOrder = useCallback((order: AlarmOrder) => {
    // Always play sound
    void playAlarmSound();

    // If app is in background, fire a push notification
    if (appState.current !== 'active') {
      void fireLocalNotification(order);
    }

    // Add to pending queue (cap at MAX_QUEUED)
    setPendingOrders((prev) => {
      if (prev.find((o) => o.id === order.id)) return prev;
      const next = [order, ...prev];
      return next.slice(0, MAX_QUEUED);
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const unsub = subscribeAdminOrderAlarm({ onNewOrder: handleNewOrder });
    return unsub;
  }, [handleNewOrder]);

  const dismiss = useCallback((orderId: string) => {
    setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
  }, []);

  const dismissAll = useCallback(() => {
    setPendingOrders([]);
  }, []);

  return (
    <AdminOrderAlarmModal
      orders={pendingOrders}
      onDismiss={dismiss}
      onDismissAll={dismissAll}
    />
  );
}
