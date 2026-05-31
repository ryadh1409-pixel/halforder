import React from 'react';
import { getNativeMapProvider } from '@/lib/maps/iosMapProvider';
import MapView, { Marker, Polyline } from 'react-native-maps';

export function Map({
  children,
  ...props
}: React.ComponentProps<typeof MapView>) {
  const provider = getNativeMapProvider();
  return (
    <MapView {...props} provider={provider}>
      {children}
    </MapView>
  );
}

export function MapMarker(props: React.ComponentProps<typeof Marker>) {
  return <Marker {...props} />;
}

export function MapPolyline(props: React.ComponentProps<typeof Polyline>) {
  return <Polyline {...props} />;
}
