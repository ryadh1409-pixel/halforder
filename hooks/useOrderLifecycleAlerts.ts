import {
  orderLifecycleDependencyKey,
  resolveCustomerLifecycleAlertKey,
  resolveDriverActiveLifecycleAlertKey,
  resolveRestaurantLifecycleAlertKey,
  type CustomerLifecycleAlertKey,
  type DriverLifecycleAlertKey,
  type RestaurantLifecycleAlertKey,
} from '@/lib/orderLifecycleAlerts';
import {
  showCustomerLifecycleAlert,
  showDriverLifecycleAlert,
  showDriverNewDeliveryAlert,
  showRestaurantLifecycleAlert,
} from '@/lib/orderLifecycleAlertUi';
import { stopCriticalOrderAlert } from '@/services/orderCriticalAlert';
import type { OrderStageInput } from '@/services/orderStage';
import { useEffect, useRef } from 'react';

function useLifecycleAlertOnChange<T extends string>(
  order: OrderStageInput | null | undefined,
  resolveKey: (order: OrderStageInput) => T | null,
  showAlert: (key: T, orderId: string) => void,
  onClearCritical?: (orderId: string, prevKey: T) => void,
): void {
  const lastKeyRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const dependencyKey = orderLifecycleDependencyKey(order);

  useEffect(() => {
    if (!order) return;
    const orderId = (order as { id?: string }).id?.trim() ?? '';
    const nextKey = resolveKey(order);

    if (!initializedRef.current) {
      initializedRef.current = true;
      lastKeyRef.current = nextKey;
      return;
    }

    if (lastKeyRef.current === nextKey) return;
    const prev = lastKeyRef.current as T | null;
    lastKeyRef.current = nextKey;
    if (prev && !nextKey && onClearCritical && orderId) {
      onClearCritical(orderId, prev);
      return;
    }
    if (!nextKey) return;
    showAlert(nextKey, orderId);
  }, [dependencyKey, order, resolveKey, showAlert, onClearCritical]);
}

export function useCustomerOrderLifecycleAlert(
  order: OrderStageInput | null | undefined,
): void {
  useLifecycleAlertOnChange(
    order,
    resolveCustomerLifecycleAlertKey,
    (key) => showCustomerLifecycleAlert(key),
  );
}

export function useRestaurantOrderLifecycleAlert(
  order: OrderStageInput | null | undefined,
): void {
  useLifecycleAlertOnChange(
    order,
    resolveRestaurantLifecycleAlertKey,
    showRestaurantLifecycleAlert,
  );
}

export function useDriverActiveOrderLifecycleAlert(
  order: OrderStageInput | null | undefined,
): void {
  useLifecycleAlertOnChange(
    order,
    resolveDriverActiveLifecycleAlertKey,
    showDriverLifecycleAlert,
    (orderId, prevKey) => {
      if (prevKey === 'ready_for_pickup') {
        void stopCriticalOrderAlert({
          role: 'driver',
          event: 'ready_for_pickup',
          orderId,
          reason: 'lifecycle',
        });
      }
    },
  );
}

export function useRestaurantOrdersLifecycleAlerts(
  orders: OrderStageInput[],
): void {
  const lastByOrderRef = useRef<Map<string, RestaurantLifecycleAlertKey>>(new Map());
  const initializedRef = useRef(false);
  const signature = orders
    .map((order) => {
      const id = (order as { id?: string }).id ?? '';
      return `${id}:${orderLifecycleDependencyKey(order)}`;
    })
    .join(';');

  useEffect(() => {
    if (orders.length === 0) return;

    for (const order of orders) {
      const orderId = (order as { id?: string }).id?.trim();
      if (!orderId) continue;

      const nextKey = resolveRestaurantLifecycleAlertKey(order);

      if (!initializedRef.current) {
        if (nextKey) lastByOrderRef.current.set(orderId, nextKey);
        continue;
      }

      const prevKey = lastByOrderRef.current.get(orderId);
      if (prevKey === nextKey) continue;

      if (prevKey === 'new_paid_order' && nextKey !== 'new_paid_order') {
        void stopCriticalOrderAlert({
          role: 'restaurant',
          event: 'new_order',
          orderId,
          reason: 'lifecycle',
        });
      }

      if (nextKey) {
        lastByOrderRef.current.set(orderId, nextKey);
        showRestaurantLifecycleAlert(nextKey, orderId);
      } else {
        lastByOrderRef.current.delete(orderId);
      }
    }

    initializedRef.current = true;
  }, [signature, orders]);
}

export function useDriverAvailableOrderAlerts(
  orders: Array<{ id?: string | null }>,
): void {
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const signature = orders
    .map((order) => (typeof order.id === 'string' ? order.id.trim() : ''))
    .filter(Boolean)
    .sort()
    .join(',');

  useEffect(() => {
    const ids = signature ? signature.split(',') : [];
    if (ids.length === 0) return;

    for (const orderId of ids) {
      if (!initializedRef.current) {
        seenIdsRef.current.add(orderId);
        continue;
      }
      if (seenIdsRef.current.has(orderId)) continue;
      seenIdsRef.current.add(orderId);
      showDriverNewDeliveryAlert(orderId);
    }

    initializedRef.current = true;
  }, [signature]);
}

export function useDriverActiveOrdersLifecycleAlerts(
  orders: OrderStageInput[],
): void {
  const lastByOrderRef = useRef<
    Map<string, Exclude<DriverLifecycleAlertKey, 'new_delivery_available'>>
  >(new Map());
  const initializedRef = useRef(false);
  const signature = orders
    .map((order) => {
      const id = (order as { id?: string }).id ?? '';
      return `${id}:${orderLifecycleDependencyKey(order)}`;
    })
    .join(';');

  useEffect(() => {
    if (orders.length === 0) return;

    for (const order of orders) {
      const orderId = (order as { id?: string }).id?.trim();
      if (!orderId) continue;

      const nextKey = resolveDriverActiveLifecycleAlertKey(order);

      if (!initializedRef.current) {
        if (nextKey) lastByOrderRef.current.set(orderId, nextKey);
        continue;
      }

      const prevKey = lastByOrderRef.current.get(orderId);
      if (prevKey === nextKey) continue;

      if (prevKey === 'ready_for_pickup' && nextKey !== 'ready_for_pickup') {
        void stopCriticalOrderAlert({
          role: 'driver',
          event: 'ready_for_pickup',
          orderId,
          reason: 'lifecycle',
        });
      }

      if (nextKey) {
        lastByOrderRef.current.set(orderId, nextKey);
        showDriverLifecycleAlert(nextKey, orderId);
      } else {
        lastByOrderRef.current.delete(orderId);
      }
    }

    initializedRef.current = true;
  }, [signature, orders]);
}
