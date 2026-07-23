import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';

type Props = {
  latitude: number;
  longitude: number;
  height?: number;
};

/**
 * Uber Eats–style delivery pin map for the Location screen only.
 * Uses the existing react-native-maps + Google provider stack.
 */
export function LocationScreenMap({
  latitude,
  longitude,
  height = 220,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const hasMountedRegion = useRef(false);

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    if (!hasMountedRegion.current) {
      hasMountedRegion.current = true;
      return;
    }
    mapRef.current?.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      450,
    );
  }, [latitude, longitude]);

  return (
    <View style={[styles.card, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={getNativeMapProvider()}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        userInterfaceStyle="dark"
      >
        <Marker
          coordinate={{ latitude, longitude }}
          pinColor="#A855F7"
          title="Delivery location"
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.22)',
    backgroundColor: '#171923',
    marginBottom: 12,
  },
});
