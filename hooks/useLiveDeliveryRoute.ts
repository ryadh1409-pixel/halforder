import { haversineDistanceKm } from '@/lib/haversine';
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
 * Live Google Directions route Restaurant → Driver → Customer plus ETA/distance.
 * Falls back to a straight multi-stop path + haversine ETA when Directions fails.
 */
export function useLiveDeliveryRoute(params: {
  restaurant: LatLngLiteral | null;
  driver: LatLngLiteral | null;
  customer: LatLngLiteral | null;
  enabled?: boolean;
}): LiveDeliveryRouteMetrics {
  const { restaurant, driver, customer, enabled = true } = params;
  const [coordinates, setCoordinates] = useState<LatLngLiteral[]>([]);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef<{ at: number; driverKey: string }>({
    at: 0,
    driverKey: '',
  });

  const fallbackPath = useMemo(() => {
    const pts: LatLngLiteral[] = [];
    if (restaurant) pts.push(restaurant);
    if (driver) pts.push(driver);
    if (customer) pts.push(customer);
    return pts;
  }, [
    pointKey(restaurant),
    pointKey(driver),
    pointKey(customer),
  ]);

  const fallbackMetrics = useMemo(() => {
    if (!driver || !customer) {
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
    }
    const km = haversineDistanceKm(
      driver.latitude,
      driver.longitude,
      customer.latitude,
      customer.longitude,
    );
    const eta = estimateEtaFromDistanceKm(km);
    return {
      distanceKm: km,
      etaMinutes: Math.max(1, Math.round(eta.durationSeconds / 60)),
    };
  }, [
    pointKey(restaurant),
    pointKey(driver),
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
    const shouldFetch =
      prev.at === 0 || movedEnough || intervalElapsed || prev.driverKey !== driverKey;

    if (!shouldFetch && coordinates.length >= 2) {
      // Still refresh haversine ETA between Directions fetches.
      setDistanceKm(fallbackMetrics.distanceKm);
      setEtaMinutes(fallbackMetrics.etaMinutes);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        let origin: LatLngLiteral | null = null;
        let destination: LatLngLiteral | null = null;
        let waypoints: LatLngLiteral[] | undefined;

        if (restaurant && driver && customer) {
          origin = restaurant;
          waypoints = [driver];
          destination = customer;
        } else if (driver && customer) {
          origin = driver;
          destination = customer;
        } else if (restaurant && customer) {
          origin = restaurant;
          destination = customer;
        } else if (restaurant && driver) {
          origin = driver;
          destination = restaurant;
        }

        if (!origin || !destination) {
          if (!cancelled) {
            setCoordinates(fallbackPath);
            setDistanceKm(fallbackMetrics.distanceKm);
            setEtaMinutes(fallbackMetrics.etaMinutes);
          }
          return;
        }

        const result = await fetchDirections({
          origin,
          destination,
          waypoints,
          mode: 'driving',
        });
        if (cancelled) return;
        lastFetchRef.current = { at: Date.now(), driverKey };
        setCoordinates(
          result.coordinates.length >= 2 ? result.coordinates : fallbackPath,
        );
        // Remaining distance/ETA = driver → customer (last leg when R→D→C).
        const remaining =
          result.legs.length > 1
            ? result.legs[result.legs.length - 1]
            : {
                distanceMeters: result.distanceMeters,
                durationSeconds: result.durationSeconds,
              };
        setDistanceKm(remaining.distanceMeters / 1000);
        setEtaMinutes(Math.max(1, Math.round(remaining.durationSeconds / 60)));
      } catch {
        if (cancelled) return;
        lastFetchRef.current = { at: Date.now(), driverKey };
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
    fallbackMetrics.distanceKm,
    fallbackMetrics.etaMinutes,
  ]);

  return {
    coordinates: coordinates.length >= 2 ? coordinates : fallbackPath,
    distanceKm: distanceKm ?? fallbackMetrics.distanceKm,
    etaMinutes: etaMinutes ?? fallbackMetrics.etaMinutes,
    loading,
  };
}
