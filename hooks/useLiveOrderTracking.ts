import { useEffect, useState } from 'react';

import { parseLegacyLatLng, type LegacyLatLng } from '@/lib/location/coordinates';
import { subscribeOrderById, type RestaurantOrder } from '@/services/orderService';

export type LiveOrderTrackingState = {
  order: RestaurantOrder | null;
  loading: boolean;
  error: boolean;
  driverLocation: LegacyLatLng | null;
  customerLocation: LegacyLatLng | null;
  restaurantLocation: LegacyLatLng | null;
};

/** Realtime customer-side order + location tracking from Firestore. */
export function useLiveOrderTracking(orderId: string | null | undefined): LiveOrderTrackingState {
  const [order, setOrder] = useState<RestaurantOrder | null>(null);
  const [loading, setLoading] = useState(Boolean(orderId?.trim()));
  const [error, setError] = useState(false);

  useEffect(() => {
    const id = orderId?.trim();
    if (!id) {
      setOrder(null);
      setLoading(false);
      setError(false);
      return undefined;
    }

    setLoading(true);
    setError(false);

    return subscribeOrderById(
      id,
      (next) => {
        setLoading(false);
        setError(false);
        setOrder(next);
      },
      {
        onListenError: () => {
          setLoading(false);
          setError(true);
        },
      },
    );
  }, [orderId]);

  const raw = order as (RestaurantOrder & { customerLocation?: unknown }) | null;

  return {
    order,
    loading,
    error,
    driverLocation: parseLegacyLatLng(order?.driverLocation ?? null),
    customerLocation:
      parseLegacyLatLng(raw?.customerLocation) ??
      parseLegacyLatLng(order?.userLocation) ??
      parseLegacyLatLng(order?.deliveryLocation),
    restaurantLocation: parseLegacyLatLng(order?.restaurantLocation),
  };
}
