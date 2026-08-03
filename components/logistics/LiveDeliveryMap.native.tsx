import { LiveDriverVehicleMarker } from '@/components/maps/LiveDriverVehicleMarker';
import { useLiveDriverMarker } from '@/hooks/useLiveDriverMarker';
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
  extraDropoffs = [],
  driver,
  driverHeading,
  dark = true,
}: LiveDeliveryMapProps) {
  const mapRef = useRef<MapView | null>(null);

  const liveInput = useMemo(
    () =>
      driver
        ? {
            latitude: driver.latitude,
            longitude: driver.longitude,
            heading: driverHeading ?? null,
          }
        : null,
    [driver?.latitude, driver?.longitude, driverHeading],
  );

  const {
    coordinate: displayDriver,
    heading: resolvedHeading,
    awaitingFirstFix,
    waitingForLiveUpdate,
    animatedCoordinate,
  } = useLiveDriverMarker(liveInput);

  const markerPoints = useMemo(
    () =>
      collectMapCoordinates(
        restaurant ? { latitude: restaurant.latitude, longitude: restaurant.longitude } : null,
        dropoff ? { latitude: dropoff.latitude, longitude: dropoff.longitude } : null,
        ...extraDropoffs.map((s) => s.coordinate),
        displayDriver
          ? { latitude: displayDriver.latitude, longitude: displayDriver.longitude }
          : null,
      ),
    [restaurant, dropoff, extraDropoffs, displayDriver],
  );

  useEffect(() => {
    if (!mapRef.current || markerPoints.length < 1) return;
    fitMapToCoordinates(mapRef.current as never, markerPoints);
  }, [markerPoints]);

  const initial = useMemo(() => regionFromCoordinates(markerPoints), [markerPoints]);
  const mapProvider = getNativeMapProvider();
  const showWaitingBanner = waitingForLiveUpdate || (awaitingFirstFix && Boolean(driver));

  if (!initial) {
    return (
      <View style={[styles.fallback, dark && styles.fallbackDark]}>
        <ActivityIndicator color="#22C55E" />
        <Text style={styles.fallbackText}>Waiting for driver location…</Text>
      </View>
    );
  }

  return (
    <View style={styles.map}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
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
        {extraDropoffs.map((stop) => (
          <Marker
            key={stop.id}
            coordinate={stop.coordinate}
            title={stop.title}
            anchor={{ x: 0.5, y: 1 }}
          >
            <Pin color="#2563EB" glyph="🏠" />
          </Marker>
        ))}
        {displayDriver ? (
          <LiveDriverVehicleMarker
            coordinate={displayDriver}
            heading={resolvedHeading}
            title="Driver"
            animatedCoordinate={animatedCoordinate}
          />
        ) : null}
      </MapView>
      {showWaitingBanner ? (
        <View style={styles.waitingBanner} pointerEvents="none">
          <Text style={styles.waitingText}>Waiting for driver location…</Text>
        </View>
      ) : null}
    </View>
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
  waitingBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  waitingText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
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
});

export type { MapCoord, LiveDeliveryMapProps } from './liveDeliveryMapTypes';
