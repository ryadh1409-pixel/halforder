import React from 'react';
import { StyleSheet, View } from 'react-native';

// Metro resolves `@/components/maps` → platform entrypoints.
// eslint-disable-next-line import/no-unresolved -- platform entrypoints
import MapRenderer from '@/components/maps';

type Props = {
  latitude: number;
  longitude: number;
  height?: number;
};

/** Web fallback — same Google Maps stack via MapRenderer. */
export function LocationScreenMap({
  latitude,
  longitude,
  height = 220,
}: Props) {
  return (
    <View style={[styles.card, { height }]}>
      <MapRenderer
        key={`${latitude.toFixed(5)},${longitude.toFixed(5)}`}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }}
        markers={[
          {
            id: 'delivery',
            latitude,
            longitude,
            pinColor: '#A855F7',
            title: 'Delivery location',
          },
        ]}
        userInterfaceStyle="dark"
        webTitle="Delivery location"
        webSubtitle="Selected pin"
      />
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
