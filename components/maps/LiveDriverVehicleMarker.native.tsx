import {
  MAP_Z_DRIVER,
} from '@/lib/maps/mapMarkerLayers';
import type { MapLatLng } from '@/lib/maps/liveDriverMarker';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

export type LiveDriverVehicleMarkerProps = {
  coordinate: MapLatLng;
  heading?: number;
  title?: string;
  zIndex?: number;
  /** AnimatedRegion from useLiveDriverMarker — updates position without remounting. */
  animatedCoordinate?: unknown | null;
};

const MarkerAnimated =
  // Marker.Animated exists on native react-native-maps builds.
  (Marker as unknown as { Animated?: typeof Marker }).Animated ?? Marker;

/**
 * Canonical Uber-style vehicle marker — shared by Driver, Customer, Restaurant, Admin.
 * Position source: `orders.driverLocation` / live GPS session (display-only here).
 */
export function LiveDriverVehicleMarker({
  coordinate,
  heading = 0,
  title = 'Driver',
  zIndex = MAP_Z_DRIVER,
  animatedCoordinate = null,
}: LiveDriverVehicleMarkerProps) {
  const rotation = Number.isFinite(heading) ? heading : 0;
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const primedRef = useRef(false);

  useEffect(() => {
    // Prime custom view once, then freeze bitmap so GPS ticks never flicker.
    setTracksViewChanges(true);
    const t = setTimeout(() => {
      setTracksViewChanges(false);
      primedRef.current = true;
    }, 900);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!primedRef.current) return;
    // Heading-only chrome refresh — brief tracksViewChanges, then freeze again.
    setTracksViewChanges(true);
    const t = setTimeout(() => setTracksViewChanges(false), 400);
    return () => clearTimeout(t);
  }, [rotation]);

  useEffect(() => {
    console.log('[LIVE DRIVER MARKER UPDATED]', {
      received: {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        heading: rotation,
      },
      renderDecision: 'show',
      reason: null,
      tracksViewChanges,
      zIndex,
      animated: Boolean(animatedCoordinate),
      timestamp: Date.now(),
    });
  }, [
    coordinate.latitude,
    coordinate.longitude,
    rotation,
    tracksViewChanges,
    zIndex,
    animatedCoordinate,
  ]);

  const MarkerComponent = animatedCoordinate ? MarkerAnimated : Marker;
  const coordinateProp = animatedCoordinate
    ? { coordinate: animatedCoordinate as never }
    : { coordinate };

  return (
    <MarkerComponent
      identifier="live-driver"
      {...coordinateProp}
      title={title}
      description="Live driver"
      flat
      rotation={rotation}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={zIndex}
      tracksViewChanges={tracksViewChanges}
      pinColor="#16A34A"
    >
      <View style={styles.vehicleMarker} pointerEvents="none">
        <View style={styles.vehicleInner}>
          <Text style={styles.vehicleEmoji}>🚗</Text>
        </View>
      </View>
    </MarkerComponent>
  );
}

const styles = StyleSheet.create({
  vehicleMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#166534',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.28,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  vehicleInner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
  },
  vehicleEmoji: {
    fontSize: 28,
  },
});
