export type DeliveryMapPoint = {
  latitude: number;
  longitude: number;
  label?: string;
};

function fmtCoord(p: DeliveryMapPoint): string {
  return `${p.latitude},${p.longitude}`;
}

/**
 * Build a Google Maps directions URL showing restaurant → driver → customer
 * (or restaurant → customer when the driver pin is unavailable).
 */
export function buildDeliveryTrackingMapsUrl(params: {
  restaurant: DeliveryMapPoint | null;
  driver: DeliveryMapPoint | null;
  customer: DeliveryMapPoint | null;
}): string | null {
  const { restaurant, driver, customer } = params;
  if (!restaurant && !customer) return null;

  const origin = restaurant ?? driver;
  const destination = customer ?? restaurant;
  if (!origin || !destination) return null;

  const waypoints: string[] = [];
  if (restaurant && driver && customer) {
    waypoints.push(fmtCoord(driver));
  }

  const qs = new URLSearchParams({
    api: '1',
    origin: fmtCoord(origin),
    destination: fmtCoord(destination),
    travelmode: 'driving',
  });
  if (waypoints.length) {
    qs.set('waypoints', waypoints.join('|'));
  }

  return `https://www.google.com/maps/dir/?${qs.toString()}`;
}
