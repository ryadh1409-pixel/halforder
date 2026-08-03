import { haversineDistanceKm } from '@/lib/haversine';
import {
  driverMarkerAnimationDurationMs,
  resolveDriverMarkerHeading,
  validMapCoord,
  type LiveDriverLocationInput,
  type MapLatLng,
} from '@/lib/maps/liveDriverMarker';
import { useEffect, useMemo, useRef, useState } from 'react';

let AnimatedRegionCtor: any = null;
try {
  const rnm = require('react-native-maps');
  AnimatedRegionCtor = rnm.AnimatedRegion;
} catch {
  AnimatedRegionCtor = null;
}

export type UseLiveDriverMarkerResult = {
  /** Last known display coordinate (never cleared on temporary GPS loss). */
  coordinate: MapLatLng | null;
  heading: number;
  /** True until the first valid fix arrives. */
  awaitingFirstFix: boolean;
  /** Had a fix earlier; live input is temporarily null. */
  waitingForLiveUpdate: boolean;
  /** AnimatedRegion for MarkerAnimated, or null on web / unavailable. */
  animatedCoordinate: unknown | null;
};

function toCoord(input: LiveDriverLocationInput): MapLatLng | null {
  if (!input) return null;
  return validMapCoord({
    latitude: input.latitude,
    longitude: input.longitude,
  });
}

/**
 * Retains last known driver GPS and smoothly animates between updates.
 * Shared by Driver / Customer / Admin live maps.
 */
export function useLiveDriverMarker(
  live: LiveDriverLocationInput,
): UseLiveDriverMarkerResult {
  const [coordinate, setCoordinate] = useState<MapLatLng | null>(() => toCoord(live));
  const [heading, setHeading] = useState(0);
  const [awaitingFirstFix, setAwaitingFirstFix] = useState(() => !toCoord(live));
  const [waitingForLiveUpdate, setWaitingForLiveUpdate] = useState(false);
  const [animatedCoordinate, setAnimatedCoordinate] = useState<unknown | null>(null);

  const lastCoordRef = useRef<MapLatLng | null>(toCoord(live));
  const lastHeadingRef = useRef<number>(0);
  const seededRef = useRef(false);
  const animRef = useRef<any>(null);

  const liveCoord = useMemo(() => toCoord(live), [live?.latitude, live?.longitude]);
  const liveHeading = live?.heading ?? null;

  useEffect(() => {
    if (!liveCoord) {
      if (lastCoordRef.current) {
        setWaitingForLiveUpdate(true);
      }
      return;
    }

    setWaitingForLiveUpdate(false);
    setAwaitingFirstFix(false);
    setCoordinate(liveCoord);

    const nextHeading = resolveDriverMarkerHeading({
      reportedHeading: liveHeading,
      previous: lastCoordRef.current,
      next: liveCoord,
      previousHeading: lastHeadingRef.current,
    });
    lastHeadingRef.current = nextHeading;
    setHeading(nextHeading);

    if (!AnimatedRegionCtor) {
      lastCoordRef.current = liveCoord;
      return;
    }

    if (!animRef.current) {
      animRef.current = new AnimatedRegionCtor({
        latitude: liveCoord.latitude,
        longitude: liveCoord.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      setAnimatedCoordinate(animRef.current);
      seededRef.current = false;
    }

    const anim = animRef.current;
    if (!seededRef.current) {
      anim.setValue({
        ...liveCoord,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      lastCoordRef.current = liveCoord;
      seededRef.current = true;
      return;
    }

    const prev = lastCoordRef.current;
    const km = prev
      ? haversineDistanceKm(
          prev.latitude,
          prev.longitude,
          liveCoord.latitude,
          liveCoord.longitude,
        )
      : 0;
    const duration = driverMarkerAnimationDurationMs(prev, liveCoord, km);
    lastCoordRef.current = liveCoord;

    if (duration <= 0) {
      anim.setValue({
        ...liveCoord,
        latitudeDelta: 0,
        longitudeDelta: 0,
      });
      return;
    }

    anim
      .timing({
        latitude: liveCoord.latitude,
        longitude: liveCoord.longitude,
        latitudeDelta: 0,
        longitudeDelta: 0,
        duration,
        useNativeDriver: false,
      } as never)
      .start();
  }, [liveCoord?.latitude, liveCoord?.longitude, liveHeading]);

  return {
    coordinate,
    heading,
    awaitingFirstFix,
    waitingForLiveUpdate,
    animatedCoordinate,
  };
}
