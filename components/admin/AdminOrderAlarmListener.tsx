/**
 * AdminOrderAlarmListener
 *
 * Mount once inside the admin layout. When a new paid order arrives:
 *  1. Starts the canonical critical alarm (looping sound + local notifs)
 *  2. Shows the red alarm modal with full order info
 *
 * Safe to mount even if notification permissions are denied — the modal
 * and in-app sound still work as a fallback.
 */
import { AdminOrderAlarmModal } from '@/components/admin/AdminOrderAlarmModal';
import type { AlarmOrder } from '@/services/adminOrderAlarm';
import { subscribeAdminOrderAlarm } from '@/services/adminOrderAlarm';
import {
  startCriticalOrderAlert,
  stopCriticalOrderAlert,
} from '@/services/orderCriticalAlert';
import React, { useCallback, useEffect, useState } from 'react';

const MAX_QUEUED = 20;

export function AdminOrderAlarmListener() {
  const [pendingOrders, setPendingOrders] = useState<AlarmOrder[]>([]);

  const handleNewOrder = useCallback((order: AlarmOrder) => {
    const itemSummary =
      order.items.length > 0
        ? order.items
            .slice(0, 3)
            .map((it) => `${it.qty}× ${it.name}`)
            .join(', ') + (order.items.length > 3 ? '…' : '')
        : `${order.itemCount} items`;

    void startCriticalOrderAlert({
      role: 'admin',
      event: 'new_order',
      orderId: order.orderId,
      title: `New Order — CA$${order.totalPrice.toFixed(2)}`,
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
    });

    setPendingOrders((prev) => {
      if (prev.find((o) => o.id === order.id)) return prev;
      const next = [order, ...prev];
      return next.slice(0, MAX_QUEUED);
    });
  }, []);

  useEffect(() => {
    const unsub = subscribeAdminOrderAlarm({ onNewOrder: handleNewOrder });
    return unsub;
  }, [handleNewOrder]);

  const dismiss = useCallback((orderId: string) => {
    void stopCriticalOrderAlert({
      role: 'admin',
      event: 'new_order',
      orderId,
      reason: 'ack',
    });
    setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
  }, []);

  const dismissAll = useCallback(() => {
    setPendingOrders((prev) => {
      for (const order of prev) {
        void stopCriticalOrderAlert({
          role: 'admin',
          event: 'new_order',
          orderId: order.orderId,
          reason: 'ack',
        });
      }
      return [];
    });
  }, []);

  return (
    <AdminOrderAlarmModal
      orders={pendingOrders}
      onDismiss={dismiss}
      onDismissAll={dismissAll}
    />
  );
}
