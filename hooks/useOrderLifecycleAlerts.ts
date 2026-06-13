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
import type { OrderStageInput } from '@/services/orderStage';
import { useEffect, useRef } from 'react';

function useLifecycleAlertOnChange<T extends string>(
  order: OrderStageInput | null | undefined,
  resolveKey: (order: OrderStageInput) => T | null,
  showAlert: (key: T) => void,
): void {
  const lastKeyRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const dependencyKey = orderLifecycleDependencyKey(order);

  useEffect(() => {
    if (!order) return;
    const nextKey = resolveKey(order);
    if (!nextKey) return;

    if (!initializedRef.current) {
      initializedRef.current = true;
      lastKeyRef.current = nextKey;
      return;
    }

    if (lastKeyRef.current === nextKey) return;
    lastKeyRef.current = nextKey;
    showAlert(nextKey);
  }, [dependencyKey, order, resolveKey, showAlert]);
}

export function useCustomerOrderLifecycleAlert(
  order: OrderStageInput | null | undefined,
): void {
  useLifecycleAlertOnChange(
    order,
    resolveCustomerLifecycleAlertKey,
    showCustomerLifecycleAlert,
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
      if (!nextKey) continue;

      if (!initializedRef.current) {
        lastByOrderRef.current.set(orderId, nextKey);
        continue;
      }

      const prevKey = lastByOrderRef.current.get(orderId);
      if (prevKey === nextKey) continue;

      lastByOrderRef.current.set(orderId, nextKey);
      showRestaurantLifecycleAlert(nextKey);
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
      showDriverNewDeliveryAlert();
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
      if (!nextKey) continue;

      if (!initializedRef.current) {
        lastByOrderRef.current.set(orderId, nextKey);
        continue;
      }

      const prevKey = lastByOrderRef.current.get(orderId);
      if (prevKey === nextKey) continue;

      lastByOrderRef.current.set(orderId, nextKey);
      showDriverLifecycleAlert(nextKey);
    }

    initializedRef.current = true;
  }, [signature, orders]);
}
