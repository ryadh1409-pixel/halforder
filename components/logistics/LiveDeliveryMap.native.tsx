import { regionFromCoordinates, collectMapCoordinates } from '@/lib/location/coordinates';
import { fitMapToCoordinates } from '@/lib/maps/fitMapRegion';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import type { LiveDeliveryMapProps } from './liveDeliveryMapTypes';
import React, { memo, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

function Pin({ color, glyph }: { color: string; glyph: string }) {
  return (
    <View style={styles.pinWrap}>
      <View style={[styles.pinHead, { backgroundColor: color }]}>
        <Text style={styles.pinGlyph}>{glyph}</Text>
      </View>
      <View style={[styles.pinStem, { borderTopColor: color }]} />
    </View>
  );
}

function LiveDeliveryMapInner({
  polylineCoords,
  restaurant,
  dropoff,
  driver,
  driverHeading,
  dark = true,
}: LiveDeliveryMapProps) {
  const mapRef = useRef<MapView | null>(null);

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
          strokeColor="rgba(168, 85, 247, 0.9)"
          strokeWidth={4}
        />
      ) : null}
      {restaurant ? (
        <Marker coordinate={restaurant} title="Restaurant" anchor={{ x: 0.5, y: 1 }}>
          <Pin color="#A855F7" glyph="🍽" />
        </Marker>
      ) : null}
      {dropoff ? (
        <Marker coordinate={dropoff} title="Customer" anchor={{ x: 0.5, y: 1 }}>
          <Pin color="#38BDF8" glyph="📍" />
        </Marker>
      ) : null}
      {driver ? (
        <Marker
          coordinate={driver}
          title="Driver"
          rotation={typeof driverHeading === 'number' ? driverHeading : 0}
          flat
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.driverBubble}>
            <Text style={styles.driverGlyph}>🚗</Text>
          </View>
        </Marker>
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
    backgroundColor: '#0B0816',
  },
  fallbackDark: { backgroundColor: '#020617' },
  fallbackText: {
    color: 'rgba(226,232,240,0.75)',
    fontWeight: '600',
    paddingHorizontal: 24,
    textAlign: 'center',
    marginTop: 10,
  },
  pinWrap: { alignItems: 'center' },
  pinHead: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  pinGlyph: { fontSize: 14 },
  pinStem: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  driverBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  driverGlyph: { fontSize: 18 },
});

export type { MapCoord, LiveDeliveryMapProps } from './liveDeliveryMapTypes';
