import { decodeGooglePolyline } from '@/lib/maps/decodeGooglePolyline';
import { buildDeliveryTrackingMapsUrl } from '@/lib/maps/buildDeliveryTrackingMapsUrl';

describe('decodeGooglePolyline', () => {
  it('decodes a known encoded polyline', () => {
    const pts = decodeGooglePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts.length).toBeGreaterThanOrEqual(2);
    expect(pts[0].latitude).toBeCloseTo(38.5, 1);
    expect(pts[0].longitude).toBeCloseTo(-120.2, 1);
  });
});

describe('buildDeliveryTrackingMapsUrl', () => {
  it('includes restaurant, driver waypoint, and customer destination', () => {
    const url = buildDeliveryTrackingMapsUrl({
      restaurant: { latitude: 43.65, longitude: -79.38 },
      driver: { latitude: 43.66, longitude: -79.39 },
      customer: { latitude: 43.67, longitude: -79.4 },
    });
    expect(url).toContain('https://www.google.com/maps/dir/?');
    expect(url).toContain('origin=43.65%2C-79.38');
    expect(url).toContain('destination=43.67%2C-79.4');
    expect(url).toContain('waypoints=43.66%2C-79.39');
  });

  it('falls back to restaurant → customer when driver is missing', () => {
    const url = buildDeliveryTrackingMapsUrl({
      restaurant: { latitude: 43.65, longitude: -79.38 },
      driver: null,
      customer: { latitude: 43.67, longitude: -79.4 },
    });
    expect(url).toContain('origin=43.65%2C-79.38');
    expect(url).toContain('destination=43.67%2C-79.4');
    expect(url).not.toContain('waypoints=');
  });
});
