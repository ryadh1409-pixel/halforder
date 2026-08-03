import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import type { MapLatLng } from '@/lib/maps/liveDriverMarker';

export type LiveDriverVehicleMarkerProps = {
  coordinate: MapLatLng;
  heading?: number;
  title?: string;
  zIndex?: number;
  /** Kept for API compatibility with useLiveDriverMarker; position uses `coordinate`. */
  animatedCoordinate?: unknown | null;
};

/**
 * Uber-style vehicle marker — shared by Driver, Customer, and Admin maps.
 * Canonical position comes from `orders.driverLocation` / live GPS session.
 *
 * Custom marker children need a brief `tracksViewChanges={true}` window or
 * react-native-maps paints a blank (invisible) vehicle.
 */
export function LiveDriverVehicleMarker({
  coordinate,
  heading = 0,
  title = 'Driver',
  zIndex = 30,
}: LiveDriverVehicleMarkerProps) {
  const rotation = Number.isFinite(heading) ? heading : 0;
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const t = setTimeout(() => setTracksViewChanges(false), 800);
    return () => clearTimeout(t);
  }, [coordinate.latitude, coordinate.longitude, rotation, title]);

  useEffect(() => {
    console.log('[LIVE DRIVER MARKER]', {
      received: {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        heading: rotation,
      },
      renderDecision: 'show',
      reason: null,
      tracksViewChanges,
      zIndex,
    });
  }, [
    coordinate.latitude,
    coordinate.longitude,
    rotation,
    tracksViewChanges,
    zIndex,
  ]);

  return (
    <Marker
      identifier="live-driver"
      coordinate={coordinate}
      title={title}
      flat
      rotation={rotation}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={zIndex}
      tracksViewChanges={tracksViewChanges}
    >
      <View style={styles.vehicleMarker} pointerEvents="none">
        <Text style={styles.vehicleEmoji}>🚗</Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  vehicleMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 2,
    borderColor: '#166534',
  },
  vehicleEmoji: {
    fontSize: 24,
  },
});
