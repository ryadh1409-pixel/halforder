import React from 'react';
import { Text, View } from 'react-native';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';

// Gracefully handle missing native module (e.g. old dev client binary).
let MapView: React.ComponentType<any> | null = null;
let Marker: React.ComponentType<any> | null = null;
let Polyline: React.ComponentType<any> | null = null;

try {
  const rnm = require('react-native-maps');
  MapView = rnm.default;
  Marker = rnm.Marker;
  Polyline = rnm.Polyline;
} catch {
  // Native module not available — will render fallback below.
}

export { Marker, Polyline };

export default function SafeMap(props: {
  style?: object;
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  showsUserLocation?: boolean;
  children?: React.ReactNode;
  [key: string]: unknown;
}) {
  const { children, style, ...rest } = props;

  if (!MapView) {
    return (
      <View
        style={[
          { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a2e' },
          style as object,
        ]}
      >
        <Text style={{ color: '#888', fontSize: 13 }}>Map unavailable in this build</Text>
      </View>
    );
  }

  const provider = getNativeMapProvider();
  return (
    <MapView {...rest} style={style} provider={provider}>
      {children}
    </MapView>
  );
}
