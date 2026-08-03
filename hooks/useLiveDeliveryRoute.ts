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

function waypointsKey(points: LatLngLiteral[]): string {
  return points.map(pointKey).join('|');
}

/**
 * Live Google Directions for the active delivery leg:
 * - before pickup: Driver → Restaurant
 * - after pickup: Driver → current customer (optional remaining customers as waypoints)
 */
export function useLiveDeliveryRoute(params: {
  restaurant: LatLngLiteral | null;
  driver: LatLngLiteral | null;
  customer: LatLngLiteral | null;
  /** Remaining customer stops after the active destination (shared deliveries). */
  remainingCustomers?: LatLngLiteral[];
  enabled?: boolean;
  deliveryStatus?: unknown;
  kitchenStatus?: unknown;
}): LiveDeliveryRouteMetrics {
  const {
    restaurant,
    driver,
    customer,
    remainingCustomers = [],
    enabled = true,
    deliveryStatus,
    kitchenStatus,
  } = params;
  const [coordinates, setCoordinates] = useState<LatLngLiteral[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef<{ at: number; driverKey: string; leg: string; wp: string }>({
    at: 0,
    driverKey: '',
    leg: '',
    wp: '',
  });

  const routeLeg = useMemo(
    () => deliveryMapLegFromStatuses(deliveryStatus, kitchenStatus),
    [deliveryStatus, kitchenStatus],
  );

  const destination = routeLeg === 'to_customer' ? customer : restaurant;
  const waypoints =
    routeLeg === 'to_customer' && remainingCustomers.length > 0
      ? remainingCustomers
      : [];

  const fallbackPath = useMemo(() => {
    const pts: LatLngLiteral[] = [];
    if (driver) pts.push(driver);
    if (destination) pts.push(destination);
    for (const wp of waypoints) pts.push(wp);
    if (pts.length >= 2) return pts;
    if (restaurant) pts.push(restaurant);
    if (customer && (!restaurant || customer !== restaurant)) pts.push(customer);
    for (const wp of remainingCustomers) pts.push(wp);
    return pts;
  }, [
    pointKey(driver),
    pointKey(destination),
    pointKey(restaurant),
    pointKey(customer),
    waypointsKey(waypoints),
    waypointsKey(remainingCustomers),
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
    const wpKey = waypointsKey(waypoints);
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
    const waypointsChanged = prev.wp !== wpKey;
    const shouldFetch =
      prev.at === 0 ||
      movedEnough ||
      intervalElapsed ||
      prev.driverKey !== driverKey ||
      legChanged ||
      waypointsChanged;

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
          waypoints: waypoints.length > 0 ? waypoints : undefined,
          mode: 'driving',
        });
        if (cancelled) return;
        lastFetchRef.current = {
          at: Date.now(),
          driverKey,
          leg: routeLeg,
          wp: wpKey,
        };
        setCoordinates(
          result.coordinates.length >= 2 ? result.coordinates : fallbackPath,
        );
        // ETA to the active destination = first leg when waypoints exist.
        const firstLeg = result.legs[0];
        setDistanceKm(
          (firstLeg?.distanceMeters ?? result.distanceMeters) / 1000,
        );
        setEtaMinutes(
          Math.max(
            1,
            Math.round((firstLeg?.durationSeconds ?? result.durationSeconds) / 60),
          ),
        );
      } catch {
        if (cancelled) return;
        lastFetchRef.current = {
          at: Date.now(),
          driverKey,
          leg: routeLeg,
          wp: wpKey,
        };
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
    waypointsKey(waypoints),
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
