import {
  MAP_Z_DRIVER,
} from '@/lib/maps/mapMarkerLayers';
import type { MapLatLng } from '@/lib/maps/liveDriverMarker';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
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
    if (!__DEV__) return;
    console.log('[LIVE DRIVER MARKER UPDATED]', {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      heading: rotation,
      tracksViewChanges,
      animated: Boolean(animatedCoordinate),
    });
  }, [
    coordinate.latitude,
    coordinate.longitude,
    rotation,
    tracksViewChanges,
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
      accessibilityLabel="Driver location"
    >
      <View style={styles.vehicleMarker} pointerEvents="none">
        <View style={styles.vehicleInner}>
          <Ionicons name="navigate" size={22} color="#166534" />
        </View>
      </View>
    </MarkerComponent>
  );
}

const styles = StyleSheet.create({
  vehicleMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
});
