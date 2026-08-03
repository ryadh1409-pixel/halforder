import { TrackingMapFallbackCard } from '@/components/maps/TrackingMapFallback';
import type { RestaurantOrder } from '@/services/orderService';
import React from 'react';

export function CustomerTrackingMap({
  order,
}: {
  order: RestaurantOrder;
  routeCoordinates?: { latitude: number; longitude: number }[];
  etaMinutes?: number | null;
  e2eCapture?: boolean;
  e2ePhase?: string;
}) {
  const pickupLabel =
    order.restaurant?.address?.trim() || order.restaurant?.name || 'Restaurant';
  const dropoffLabel =
    order.deliveryLocation?.address?.trim() || order.customer?.address || 'Your address';
  return <TrackingMapFallbackCard pickup={pickupLabel} dropoff={dropoffLabel} />;
}
