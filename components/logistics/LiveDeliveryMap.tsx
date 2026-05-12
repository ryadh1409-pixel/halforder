import { isExpoGo } from '@/constants/runtimeEnvironment';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

export type MapCoord = { latitude: number; longitude: number };

type Props = {
  /** Restaurant → dropoff → driver (straight segments; replace with Directions polyline when available). */
  polylineCoords: MapCoord[];
  restaurant: MapCoord | null;
  dropoff: MapCoord | null;
  driver: MapCoord | null;
  /** Optional map rotation for driver marker (degrees). */
  driverHeading?: number | null;
  dark?: boolean;
};

let RNMaps: typeof import('react-native-maps') | null = null;
if (Platform.OS !== 'web') {
  try {
    RNMaps = require('react-native-maps');
  } catch {
    RNMaps = null;
  }
}

function LiveDeliveryMapInner({
  polylineCoords,
  restaurant,
  dropoff,
  driver,
  driverHeading,
  dark = true,
}: Props) {
  const mapRef = useRef<any>(null);

  const fitCoords = useMemo(() => {
    const pts: MapCoord[] = [...polylineCoords];
    if (restaurant) pts.push(restaurant);
    if (dropoff) pts.push(dropoff);
    if (driver) pts.push(driver);
    return pts;
  }, [polylineCoords, restaurant, dropoff, driver]);

  useEffect(() => {
    if (!mapRef.current || fitCoords.length < 2) return;
    try {
      mapRef.current.fitToCoordinates(fitCoords, {
        edgePadding: { top: 80, right: 40, bottom: 120, left: 40 },
        animated: true,
      });
    } catch {
      /* map not ready */
    }
  }, [fitCoords]);

  const initial = useMemo(() => {
    const d = driver ?? dropoff ?? restaurant;
    if (!d) {
      return {
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeDelta: 0.12,
        longitudeDelta: 0.12,
      };
    }
    return {
      latitude: d.latitude,
      longitude: d.longitude,
      latitudeDelta: 0.06,
      longitudeDelta: 0.06,
    };
  }, [driver, dropoff, restaurant]);

  if (isExpoGo) {
    return (
      <View style={[styles.fallback, dark && styles.fallbackDark]}>
        <Text style={styles.fallbackText}>
          Live maps are disabled in Expo Go. Use a development build (EAS) to track deliveries on the map.
        </Text>
      </View>
    );
  }

  if (!RNMaps || Platform.OS === 'web') {
    return (
      <View style={[styles.fallback, dark && styles.fallbackDark]}>
        <Text style={styles.fallbackText}>Live map is available on iOS and Android.</Text>
      </View>
    );
  }

  const MapView = RNMaps.default;
  const Marker = RNMaps.Marker;
  const Polyline = RNMaps.Polyline;

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={initial}
      userInterfaceStyle={dark ? 'dark' : 'light'}
      showsUserLocation={false}
      showsMyLocationButton={false}
    >
      {polylineCoords.length >= 2 ? (
        <Polyline
          coordinates={polylineCoords}
          strokeColor="rgba(52, 211, 153, 0.95)"
          strokeWidth={4}
        />
      ) : null}
      {restaurant ? (
        <Marker coordinate={restaurant} title="Restaurant" pinColor="#F59E0B" />
      ) : null}
      {dropoff ? <Marker coordinate={dropoff} title="Dropoff" pinColor="#38BDF8" /> : null}
      {driver ? (
        <Marker
          coordinate={driver}
          title="Driver"
          pinColor="#22C55E"
          rotation={typeof driverHeading === 'number' ? driverHeading : 0}
          flat
        />
      ) : null}
    </MapView>
  );
}

export const LiveDeliveryMap = memo(LiveDeliveryMapInner);

const styles = StyleSheet.create({
  map: { ...StyleSheet.absoluteFillObject },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  fallbackDark: { backgroundColor: '#020617' },
  fallbackText: { color: 'rgba(226,232,240,0.75)', fontWeight: '600', paddingHorizontal: 24, textAlign: 'center' },
});
