import type { ActiveDelivery } from '@/services/delivery';
import type { DriverOrder } from '@/services/driverService';
import type { OrderStatus } from '@/services/orderService';
import { normalizeMarketplaceDeliveryStatus } from '@/lib/orderStatus';

/**
 * Map the canonical ActiveDelivery row → Hub DriverOrder shape.
 * Display-only — does not open a second Firestore listener.
 */
export function activeDeliveryToDriverOrder(row: ActiveDelivery): DriverOrder {
  const deliveryStatus =
    (row.firestoreDeliveryStatus || row.marketplaceCourierStatus || '').trim() ||
    String(normalizeMarketplaceDeliveryStatus(row.deliveryStatus));

  return {
    id: row.id,
    groupId: null,
    restaurantId: null,
    deliveryStatus,
    expired: false,
    placedLabel: '',
    restaurantName: row.restaurantName,
    restaurantImage: row.restaurantImage,
    restaurantAddress: row.restaurantAddress,
    items: row.items.map((item) => ({ name: item.name, qty: item.qty })),
    subtotal: row.subtotal,
    deliveryFee: row.fees,
    total: row.subtotal + row.fees,
    status: (typeof row.status === 'string' ? row.status : 'driver_assigned') as OrderStatus,
    customerName: row.customerName,
    customerAvatar: null,
    customerPhone: row.customerPhone,
    restaurantPhone: row.restaurantPhone,
    restaurantLat: row.restaurantLocation?.lat ?? null,
    restaurantLng: row.restaurantLocation?.lng ?? null,
    deliveryAddress: row.deliveryAddress,
    deliveryLat: row.customerLocation?.lat ?? null,
    deliveryLng: row.customerLocation?.lng ?? null,
    notes: row.notes,
    restaurantLocation: row.restaurantLocation,
    customerLocation: row.customerLocation,
    driverLocation: row.driverLocation,
    estimatedDeliveryTime: row.estimatedDurationMin,
    distanceKm: row.distanceKm,
    acceptedAtMs: row.acceptedAtMs,
    createdAtMs: row.createdAtMs,
    deliveredAtMs: row.deliveredAtMs,
    updatedAtMs: row.updatedAtMs,
    driverId: row.driverId,
    assignedDriverId: row.assignedDriverId,
    marketplaceArchived: false,
    earningsRecorded: false,
  };
}
