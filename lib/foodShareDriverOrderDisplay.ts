import type { DriverOrder } from '@/services/driverService';

export function isFoodShareDriverOrder(order: DriverOrder): boolean {
  return order.isFoodShare === true;
}

export function foodSharePickupLabel(order: DriverOrder): string {
  return order.pickupName?.trim() || order.restaurantName || 'Pickup';
}

export function foodShareDropoffLabel(order: DriverOrder): string {
  return order.dropoffName?.trim() || order.customerName?.trim() || 'Customer';
}

export function foodSharePickupAddress(order: DriverOrder): string {
  return (
    order.pickupAddress?.trim() ||
    order.restaurantAddress?.trim() ||
    'Address unavailable'
  );
}

export function foodShareDropoffAddress(order: DriverOrder): string {
  return (
    order.dropoffAddress?.trim() ||
    order.deliveryAddress?.trim() ||
    'Address unavailable'
  );
}

export function foodSharePickupPhone(order: DriverOrder): string {
  return order.pickupPhone?.trim() || order.restaurantPhone?.trim() || '';
}

export function foodShareDropoffPhone(order: DriverOrder): string {
  return order.dropoffPhone?.trim() || order.customerPhone?.trim() || '';
}

export function foodSharePickupCoords(order: DriverOrder): {
  lat: number | null;
  lng: number | null;
} {
  return {
    lat: order.pickupLat ?? order.restaurantLat ?? null,
    lng: order.pickupLng ?? order.restaurantLng ?? null,
  };
}

export function foodShareDropoffCoords(order: DriverOrder): {
  lat: number | null;
  lng: number | null;
} {
  return {
    lat: order.dropoffLat ?? order.deliveryLat ?? order.customerLocation?.lat ?? null,
    lng: order.dropoffLng ?? order.deliveryLng ?? order.customerLocation?.lng ?? null,
  };
}
