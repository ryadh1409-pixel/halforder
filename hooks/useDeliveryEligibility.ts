import { useEffect, useMemo, useState } from 'react';

import {
  evaluateDeliveryEligibility,
  LOCATION_UNAVAILABLE_MESSAGE,
  parseRestaurantDeliverySettings,
  restaurantUnavailableEligibilityResult,
  unavailableEligibilityResult,
} from '@/lib/delivery/deliveryEligibility';
import { extractCoords } from '@/lib/location/extractCoords';
import {
  extractRestaurantCoords,
  restaurantEntityForDistance,
} from '@/lib/location/restaurantMarketplaceCoords';
import type { DeliveryEligibilityResult } from '@/types/deliveryEligibility';

const DISTANCE_RESOLVE_TIMEOUT_MS = 2_000;

type Params = {
  /** User GPS session object or Firestore user doc. */
  customerEntity: unknown;
  /** Restaurant Firestore doc or `{ lat, lng }`. */
  restaurantEntity: unknown;
  restaurantRaw?: Record<string, unknown>;
  mode?: 'delivery' | 'pickup';
  /** True while GPS is still resolving (not when silently refreshing with coords). */
  locationResolving?: boolean;
  locationReady?: boolean;
};

export type DeliveryEligibilityState = {
  eligibility: DeliveryEligibilityResult;
  /** Show spinner — max 2s then fails to unavailable. */
  distanceLoading: boolean;
  distanceTimedOut: boolean;
};

/**
 * Delivery zone evaluation with canonical coords + fail-fast when inputs missing.
 */
export function useDeliveryEligibility({
  customerEntity,
  restaurantEntity,
  restaurantRaw,
  mode = 'delivery',
  locationResolving = false,
  locationReady = true,
}: Params): DeliveryEligibilityState {
  const [distanceTimedOut, setDistanceTimedOut] = useState(false);

  const customerCoords = useMemo(
    () => extractCoords(customerEntity),
    [customerEntity],
  );
  const restaurantCoords = useMemo(() => {
    const fromEntity = extractCoords(restaurantEntity);
    if (fromEntity) return fromEntity;
    if (restaurantEntity && typeof restaurantEntity === 'object') {
      return extractRestaurantCoords(restaurantEntity as Record<string, unknown>);
    }
    return null;
  }, [restaurantEntity]);

  const settings = useMemo(
    () => parseRestaurantDeliverySettings(restaurantRaw),
    [restaurantRaw],
  );

  const waitingForCoords =
    mode === 'delivery' &&
    locationReady &&
    !customerCoords &&
    locationResolving;

  useEffect(() => {
    if (!waitingForCoords) {
      setDistanceTimedOut(false);
      return undefined;
    }
    const timer = setTimeout(() => setDistanceTimedOut(true), DISTANCE_RESOLVE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waitingForCoords]);

  const distanceLoading = waitingForCoords && !distanceTimedOut;

  const eligibility = useMemo((): DeliveryEligibilityResult => {
    if (mode !== 'pickup' && locationReady && !restaurantCoords) {
      return restaurantUnavailableEligibilityResult();
    }

    if (mode !== 'pickup' && locationReady && distanceTimedOut) {
      return unavailableEligibilityResult(LOCATION_UNAVAILABLE_MESSAGE);
    }

    if (mode !== 'pickup' && locationReady && !customerCoords && !locationResolving) {
      return unavailableEligibilityResult(LOCATION_UNAVAILABLE_MESSAGE);
    }

    return evaluateDeliveryEligibility({
      customer: customerEntity,
      restaurant:
        restaurantEntityForDistance(restaurantCoords) ?? restaurantEntity,
      settings,
      mode,
    });
  }, [
    customerEntity,
    restaurantEntity,
    settings,
    mode,
    locationReady,
    distanceTimedOut,
    customerCoords,
    restaurantCoords,
    locationResolving,
  ]);

  return {
    eligibility,
    distanceLoading,
    distanceTimedOut,
  };
}
