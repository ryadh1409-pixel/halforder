import { useMemo } from 'react';

import {
  evaluateDeliveryEligibility,
  parseRestaurantDeliverySettings,
} from '@/lib/delivery/deliveryEligibility';
import type { DeliveryEligibilityResult } from '@/types/deliveryEligibility';

type CustomerCoords = { lat: number; lng: number } | null;
type RestaurantCoords = { lat: number; lng: number } | null;

type Params = {
  customer: CustomerCoords;
  restaurant: RestaurantCoords;
  restaurantRaw?: Record<string, unknown>;
  mode?: 'delivery' | 'pickup';
};

/**
 * Memoized delivery zone evaluation for checkout and restaurant screens.
 * Recomputes when GPS or restaurant coordinates change.
 */
export function useDeliveryEligibility({
  customer,
  restaurant,
  restaurantRaw,
  mode = 'delivery',
}: Params): DeliveryEligibilityResult {
  const settings = useMemo(
    () => parseRestaurantDeliverySettings(restaurantRaw),
    [restaurantRaw],
  );

  return useMemo(
    () =>
      evaluateDeliveryEligibility({
        customer,
        restaurant,
        settings,
        mode,
      }),
    [customer, restaurant, settings, mode],
  );
}
