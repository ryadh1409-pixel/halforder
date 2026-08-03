export type MapCoord = { latitude: number; longitude: number };

export type LiveDeliveryMapProps = {
  polylineCoords: MapCoord[];
  restaurant: MapCoord | null;
  dropoff: MapCoord | null;
  /** Additional shared-delivery customer stops (Customer B, C, …). */
  extraDropoffs?: { id: string; coordinate: MapCoord; title: string }[];
  driver: MapCoord | null;
  driverHeading?: number | null;
  dark?: boolean;
};
