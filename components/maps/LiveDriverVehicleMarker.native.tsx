import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

import type { MapLatLng } from '@/lib/maps/liveDriverMarker';

let MarkerAnimated: any = null;
try {
  const rnm = require('react-native-maps');
  MarkerAnimated = rnm.MarkerAnimated;
} catch {
  MarkerAnimated = null;
}

export type LiveDriverVehicleMarkerProps = {
  coordinate: MapLatLng;
  heading?: number;
  title?: string;
  zIndex?: number;
  /** AnimatedRegion from {@link useLiveDriverMarker}, when available. */
  animatedCoordinate?: unknown | null;
};

/**
 * Uber-style vehicle marker — shared by Driver, Customer, and Admin maps.
 * Uses `orders.driverLocation` / live GPS session coords passed by the parent.
 */
export function LiveDriverVehicleMarker({
  coordinate,
  heading = 0,
  title = 'Driver',
  zIndex = 30,
  animatedCoordinate,
}: LiveDriverVehicleMarkerProps) {
  const rotation = Number.isFinite(heading) ? heading : 0;
  const chrome = (
    <View style={styles.vehicleMarker} pointerEvents="none">
      <Text style={styles.vehicleEmoji}>🚗</Text>
    </View>
  );

  if (animatedCoordinate && MarkerAnimated) {
    return (
      <MarkerAnimated
        identifier="live-driver"
        coordinate={animatedCoordinate as never}
        title={title}
        flat
        rotation={rotation}
        anchor={{ x: 0.5, y: 0.5 }}
        zIndex={zIndex}
        tracksViewChanges={false}
      >
        {chrome}
      </MarkerAnimated>
    );
  }

  return (
    <Marker
      identifier="live-driver"
      coordinate={coordinate}
      title={title}
      flat
      rotation={rotation}
      anchor={{ x: 0.5, y: 0.5 }}
      zIndex={zIndex}
      tracksViewChanges={false}
    >
      {chrome}
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
