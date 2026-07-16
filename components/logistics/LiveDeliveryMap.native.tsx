import { regionFromCoordinates, collectMapCoordinates } from '@/lib/location/coordinates';
import { fitMapToCoordinates } from '@/lib/maps/fitMapRegion';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import type { LiveDeliveryMapProps } from './liveDeliveryMapTypes';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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

  const markerPoints = useMemo(
    () =>
      collectMapCoordinates(
        restaurant ? { latitude: restaurant.latitude, longitude: restaurant.longitude } : null,
        dropoff ? { latitude: dropoff.latitude, longitude: dropoff.longitude } : null,
        driver ? { latitude: driver.latitude, longitude: driver.longitude } : null,
      ),
    [restaurant, dropoff, driver],
  );

  useEffect(() => {
    if (!mapRef.current || markerPoints.length < 1) return;
    fitMapToCoordinates(mapRef.current, markerPoints);
  }, [markerPoints]);

  const initial = useMemo(() => regionFromCoordinates(markerPoints), [markerPoints]);
  const mapProvider = getNativeMapProvider();

  if (!initial) {
    return (
      <View style={[styles.fallback, dark && styles.fallbackDark]}>
        <ActivityIndicator color="#22C55E" />
        <Text style={styles.fallbackText}>Waiting for GPS coordinates…</Text>
      </View>
    );
  }

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      provider={mapProvider}
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
    backgroundColor: '#09090B',
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
