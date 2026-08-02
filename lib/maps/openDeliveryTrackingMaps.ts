import { buildDeliveryTrackingMapsUrl } from '@/lib/maps/buildDeliveryTrackingMapsUrl';
import type { DeliveryMapPoint } from '@/lib/maps/buildDeliveryTrackingMapsUrl';
import { Linking } from 'react-native';

export type { DeliveryMapPoint };
export { buildDeliveryTrackingMapsUrl };

/**
 * Open Google Maps with restaurant, live driver (when known), and customer destination.
 */
export async function openDeliveryTrackingInGoogleMaps(params: {
  restaurant: DeliveryMapPoint | null;
  driver: DeliveryMapPoint | null;
  customer: DeliveryMapPoint | null;
}): Promise<boolean> {
  const url = buildDeliveryTrackingMapsUrl(params);
  if (!url) return false;

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
