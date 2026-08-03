import { haversineDistanceKm } from '@/lib/haversine';
import {
  deliveryMapLegFromStatuses,
  type DeliveryMapLeg,
} from '@/lib/maps/deliveryRouteStage';
import {
  estimateEtaFromDistanceKm,
  fetchDirections,
  type LatLngLiteral,
} from '@/services/maps/googleMapsApi';
import { useEffect, useMemo, useRef, useState } from 'react';

export type LiveDeliveryRouteMetrics = {
  coordinates: LatLngLiteral[];
  distanceKm: number | null;
  etaMinutes: number | null;
  loading: boolean;
  routeLeg: DeliveryMapLeg;
};

const REFETCH_MIN_MOVE_KM = 0.08;
const REFETCH_INTERVAL_MS = 40_000;

function roundCoord(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function pointKey(p: LatLngLiteral | null | undefined): string {
  if (!p) return '';
  return `${roundCoord(p.latitude)},${roundCoord(p.longitude)}`;
}

/**
 * Live Google Directions for the active delivery leg:
 * - before pickup: Driver → Restaurant
 * - after pickup: Driver → Customer
 * Falls back to a straight path + haversine ETA when Directions fails.
 */
export function useLiveDeliveryRoute(params: {
  restaurant: LatLngLiteral | null;
  driver: LatLngLiteral | null;
  customer: LatLngLiteral | null;
  enabled?: boolean;
  deliveryStatus?: unknown;
  kitchenStatus?: unknown;
}): LiveDeliveryRouteMetrics {
  const {
    restaurant,
    driver,
    customer,
    enabled = true,
    deliveryStatus,
    kitchenStatus,
  } = params;
  const [coordinates, setCoordinates] = useState<LatLngLiteral[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef<{ at: number; driverKey: string; leg: string }>({
    at: 0,
    driverKey: '',
    leg: '',
  });

  const routeLeg = useMemo(
    () => deliveryMapLegFromStatuses(deliveryStatus, kitchenStatus),
    [deliveryStatus, kitchenStatus],
  );

  const destination = routeLeg === 'to_customer' ? customer : restaurant;

  const fallbackPath = useMemo(() => {
    const pts: LatLngLiteral[] = [];
    if (driver) pts.push(driver);
    if (destination) pts.push(destination);
    if (pts.length >= 2) return pts;
    // Before driver GPS: show restaurant ↔ customer context.
    if (restaurant) pts.push(restaurant);
    if (customer && (!restaurant || customer !== restaurant)) pts.push(customer);
    return pts;
  }, [
    pointKey(driver),
    pointKey(destination),
    pointKey(restaurant),
    pointKey(customer),
    routeLeg,
  ]);

  const fallbackMetrics = useMemo(() => {
    if (driver && destination) {
      const km = haversineDistanceKm(
        driver.latitude,
        driver.longitude,
        destination.latitude,
        destination.longitude,
      );
      const eta = estimateEtaFromDistanceKm(km);
      return {
        distanceKm: km,
        etaMinutes: Math.max(1, Math.round(eta.durationSeconds / 60)),
      };
    }
    if (restaurant && customer) {
      const km = haversineDistanceKm(
        restaurant.latitude,
        restaurant.longitude,
        customer.latitude,
        customer.longitude,
      );
      const eta = estimateEtaFromDistanceKm(km);
      return {
        distanceKm: km,
        etaMinutes: Math.max(1, Math.round(eta.durationSeconds / 60)),
      };
    }
    return { distanceKm: null as number | null, etaMinutes: null as number | null };
  }, [
    pointKey(driver),
    pointKey(destination),
    pointKey(restaurant),
    pointKey(customer),
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (fallbackPath.length < 2) {
      setCoordinates([]);
      setDistanceKm(null);
      setEtaMinutes(null);
      return;
    }

    const driverKey = pointKey(driver);
    const now = Date.now();
    const prev = lastFetchRef.current;
    let movedEnough = true;
    if (prev.driverKey && driver && prev.driverKey.includes(',')) {
      const [plat, plng] = prev.driverKey.split(',').map(Number);
      if (Number.isFinite(plat) && Number.isFinite(plng)) {
        const moved = haversineDistanceKm(
          plat,
          plng,
          driver.latitude,
          driver.longitude,
        );
        movedEnough = moved >= REFETCH_MIN_MOVE_KM;
      }
    }
    const intervalElapsed = now - prev.at >= REFETCH_INTERVAL_MS;
    const legChanged = prev.leg !== routeLeg;
    const shouldFetch =
      prev.at === 0 ||
      movedEnough ||
      intervalElapsed ||
      prev.driverKey !== driverKey ||
      legChanged;

    if (!shouldFetch && coordinates.length >= 2) {
      setDistanceKm(fallbackMetrics.distanceKm);
      setEtaMinutes(fallbackMetrics.etaMinutes);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        let origin: LatLngLiteral | null = null;
        let dest: LatLngLiteral | null = null;

        if (driver && destination) {
          origin = driver;
          dest = destination;
        } else if (restaurant && customer) {
          origin = restaurant;
          dest = customer;
        }

        if (!origin || !dest) {
          if (!cancelled) {
            setCoordinates(fallbackPath);
            setDistanceKm(fallbackMetrics.distanceKm);
            setEtaMinutes(fallbackMetrics.etaMinutes);
          }
          return;
        }

        const result = await fetchDirections({
          origin,
          destination: dest,
          mode: 'driving',
        });
        if (cancelled) return;
        lastFetchRef.current = { at: Date.now(), driverKey, leg: routeLeg };
        setCoordinates(
          result.coordinates.length >= 2 ? result.coordinates : fallbackPath,
        );
        setDistanceKm(result.distanceMeters / 1000);
        setEtaMinutes(Math.max(1, Math.round(result.durationSeconds / 60)));
      } catch {
        if (cancelled) return;
        lastFetchRef.current = { at: Date.now(), driverKey, leg: routeLeg };
        setCoordinates(fallbackPath);
        setDistanceKm(fallbackMetrics.distanceKm);
        setEtaMinutes(fallbackMetrics.etaMinutes);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by rounded coords
  }, [
    enabled,
    pointKey(restaurant),
    pointKey(driver),
    pointKey(customer),
    routeLeg,
    fallbackMetrics.distanceKm,
    fallbackMetrics.etaMinutes,
  ]);

  return {
    coordinates: coordinates.length >= 2 ? coordinates : fallbackPath,
    distanceKm: distanceKm ?? fallbackMetrics.distanceKm,
    etaMinutes: etaMinutes ?? fallbackMetrics.etaMinutes,
    loading,
    routeLeg,
  };
}
