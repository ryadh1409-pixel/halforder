import React from 'react';

import type { MapLatLng } from '@/lib/maps/liveDriverMarker';

export type LiveDriverVehicleMarkerProps = {
  coordinate: MapLatLng;
  heading?: number;
  title?: string;
  zIndex?: number;
  animatedCoordinate?: unknown | null;
};

/** Web: no native map marker — parent maps render a stub. */
export function LiveDriverVehicleMarker(_props: LiveDriverVehicleMarkerProps) {
  return null;
}
