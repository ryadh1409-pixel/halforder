import React from 'react';

import type { MapLatLng } from '@/lib/maps/liveDriverMarker';
import { MAP_Z_DRIVER } from '@/lib/maps/mapMarkerLayers';

export type LiveDriverVehicleMarkerProps = {
  coordinate: MapLatLng;
  heading?: number;
  title?: string;
  zIndex?: number;
  animatedCoordinate?: unknown | null;
};

/** Web: no native map marker — parent maps render a stub. */
export function LiveDriverVehicleMarker(_props: LiveDriverVehicleMarkerProps) {
  void MAP_Z_DRIVER;
  return null;
}
