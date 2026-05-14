export type MapCoord = { latitude: number; longitude: number };

export type LiveDeliveryMapProps = {
  polylineCoords: MapCoord[];
  restaurant: MapCoord | null;
  dropoff: MapCoord | null;
  driver: MapCoord | null;
  driverHeading?: number | null;
  dark?: boolean;
};
