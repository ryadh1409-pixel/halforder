import {
  CUSTOMER_LIFECYCLE_ALERTS,
  DRIVER_LIFECYCLE_ALERTS,
  RESTAURANT_LIFECYCLE_ALERTS,
  type CustomerLifecycleAlertKey,
  type DriverLifecycleAlertKey,
  type RestaurantLifecycleAlertKey,
} from '@/lib/orderLifecycleAlerts';
import { Alert } from 'react-native';

export function showCustomerLifecycleAlert(key: CustomerLifecycleAlertKey): void {
  const copy = CUSTOMER_LIFECYCLE_ALERTS[key];
  Alert.alert(copy.title, copy.message);
}

export function showRestaurantLifecycleAlert(key: RestaurantLifecycleAlertKey): void {
  const copy = RESTAURANT_LIFECYCLE_ALERTS[key];
  Alert.alert(copy.title, copy.message);
}

export function showDriverLifecycleAlert(
  key: Exclude<DriverLifecycleAlertKey, 'new_delivery_available'>,
): void {
  const copy = DRIVER_LIFECYCLE_ALERTS[key];
  Alert.alert(copy.title, copy.message);
}

export function showDriverNewDeliveryAlert(): void {
  Alert.alert('New Delivery', 'A delivery is available near you.');
}
