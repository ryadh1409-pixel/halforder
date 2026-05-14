import { isExpoGo } from '@/constants/runtimeEnvironment';
import type { LiveDeliveryMapProps } from './liveDeliveryMapTypes';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

function LiveDeliveryMapInner({
  polylineCoords,
  restaurant,
  dropoff,
  driver,
  driverHeading,
  dark = true,
}: LiveDeliveryMapProps) {
  const mapRef = useRef<MapView | null>(null);

  const fitCoords = useMemo(() => {
    const pts = [...polylineCoords];
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
  fallbackText: {
    color: 'rgba(226,232,240,0.75)',
    fontWeight: '600',
    paddingHorizontal: 24,
    textAlign: 'center',
  },
});

export type { MapCoord, LiveDeliveryMapProps } from './liveDeliveryMapTypes';
