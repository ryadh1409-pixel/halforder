import {
  CUSTOMER_LIFECYCLE_ALERTS,
  DRIVER_LIFECYCLE_ALERTS,
  RESTAURANT_LIFECYCLE_ALERTS,
  type CustomerLifecycleAlertKey,
  type DriverLifecycleAlertKey,
  type RestaurantLifecycleAlertKey,
} from '@/lib/orderLifecycleAlerts';
import {
  startCriticalOrderAlert,
  stopCriticalOrderAlert,
} from '@/services/orderCriticalAlert';
import { Alert } from 'react-native';

export function showCustomerLifecycleAlert(key: CustomerLifecycleAlertKey): void {
  const copy = CUSTOMER_LIFECYCLE_ALERTS[key];
  Alert.alert(copy.title, copy.message);
}

export function showRestaurantLifecycleAlert(
  key: RestaurantLifecycleAlertKey,
  orderId?: string,
): void {
  const oid = orderId?.trim() ?? '';

  if (key === 'new_paid_order' && oid) {
    void startCriticalOrderAlert({
      role: 'restaurant',
      event: 'new_order',
      orderId: oid,
      title: RESTAURANT_LIFECYCLE_ALERTS.new_paid_order.title,
      body: RESTAURANT_LIFECYCLE_ALERTS.new_paid_order.message,
    });
    return;
  }

  if (oid) {
    void stopCriticalOrderAlert({
      role: 'restaurant',
      event: 'new_order',
      orderId: oid,
      reason: 'lifecycle',
    });
  }

  const copy = RESTAURANT_LIFECYCLE_ALERTS[key];
  Alert.alert(copy.title, copy.message);
}

export function showDriverLifecycleAlert(
  key: Exclude<DriverLifecycleAlertKey, 'new_delivery_available'>,
  orderId?: string,
): void {
  const oid = orderId?.trim() ?? '';

  if (key === 'ready_for_pickup' && oid) {
    void startCriticalOrderAlert({
      role: 'driver',
      event: 'ready_for_pickup',
      orderId: oid,
      title: DRIVER_LIFECYCLE_ALERTS.ready_for_pickup.title,
      body: DRIVER_LIFECYCLE_ALERTS.ready_for_pickup.message,
    });
    return;
  }

  if (oid) {
    void stopCriticalOrderAlert({
      role: 'driver',
      event: 'ready_for_pickup',
      orderId: oid,
      reason: 'lifecycle',
    });
  }

  const copy = DRIVER_LIFECYCLE_ALERTS[key];
  Alert.alert(copy.title, copy.message);
}

export function showDriverNewDeliveryAlert(orderId?: string): void {
  const oid = orderId?.trim() ?? '';
  if (oid) {
    void startCriticalOrderAlert({
      role: 'driver',
      event: 'new_delivery_available',
      orderId: oid,
      title: 'New Delivery',
      body: 'A delivery is available near you.',
    });
    return;
  }
  Alert.alert('New Delivery', 'A delivery is available near you.');
}
