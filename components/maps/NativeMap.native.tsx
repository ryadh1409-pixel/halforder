import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import type { MapRendererProps } from './types';

export default function NativeMap({
  style,
  initialRegion,
  mapType = 'standard',
  useGoogleProviderOnAndroid,
  showsUserLocation = false,
  showsMyLocationButton = false,
  toolbarEnabled = false,
  pointerEvents,
  markers = [],
  polylines = [],
  userInterfaceStyle,
  fitToCoordinates,
  fitEdgePadding = { top: 80, right: 40, bottom: 120, left: 40 },
}: MapRendererProps) {
  const mapRef = useRef<MapView | null>(null);

  useEffect(() => {
    if (!fitToCoordinates || fitToCoordinates.length < 2 || !mapRef.current) return;
    const t = setTimeout(() => {
      try {
        mapRef.current?.fitToCoordinates(fitToCoordinates, {
          edgePadding: fitEdgePadding,
          animated: true,
        });
      } catch {
        /* map not ready */
      }
    }, 200);
    return () => clearTimeout(t);
  }, [fitToCoordinates, fitEdgePadding]);

  return (
    <MapView
      ref={mapRef}
      style={style}
      mapType={mapType}
      provider={getNativeMapProvider()}
      initialRegion={initialRegion}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={showsMyLocationButton}
      toolbarEnabled={toolbarEnabled}
      pointerEvents={pointerEvents}
      userInterfaceStyle={userInterfaceStyle}
    >
      {markers.map((m) => (
        <Marker
          key={m.id}
          coordinate={{ latitude: m.latitude, longitude: m.longitude }}
          title={m.title}
          pinColor={m.variant ? undefined : m.pinColor}
          rotation={m.rotation}
          flat={m.flat}
          anchor={m.anchor}
          tracksViewChanges={false}
        >
          {m.variant === 'driver' ? (
            <View style={styles.driverMarker}>
              <Text style={styles.driverEmoji}>🚗</Text>
            </View>
          ) : m.variant === 'destination' ? (
            <View style={styles.destDot} />
          ) : null}
        </Marker>
      ))}
      {polylines.map((p) => (
        <Polyline
          key={p.id}
          coordinates={p.coordinates}
          strokeColor={p.strokeColor}
          strokeWidth={p.strokeWidth}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  driverMarker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 2,
    borderColor: '#171923',
  },
  driverEmoji: { fontSize: 22 },
  destDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#1A6FE8',
    borderWidth: 2,
    borderColor: '#fff',
  },
});

export type { LatLng, MapRendererProps } from './types';
