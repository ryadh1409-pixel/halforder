import {
  MAP_OVERLAP_THRESHOLD_KM,
  MAP_Z_CUSTOMER,
  MAP_Z_CUSTOMER_ACTIVE,
  MAP_Z_DRIVER,
  MAP_Z_POLYLINE,
  MAP_Z_RESTAURANT,
  offsetDriverFromStops,
  offsetIfOverlapping,
} from '@/lib/maps/mapMarkerLayers';

describe('mapMarkerLayers', () => {
  it('exposes canonical Uber-style z-order', () => {
    expect(MAP_Z_DRIVER).toBe(100);
    expect(MAP_Z_CUSTOMER_ACTIVE).toBe(50);
    expect(MAP_Z_CUSTOMER).toBe(48);
    expect(MAP_Z_RESTAURANT).toBe(40);
    expect(MAP_Z_POLYLINE).toBe(1);
    expect(MAP_Z_DRIVER).toBeGreaterThan(MAP_Z_CUSTOMER_ACTIVE);
    expect(MAP_Z_CUSTOMER_ACTIVE).toBeGreaterThan(MAP_Z_RESTAURANT);
    expect(MAP_Z_RESTAURANT).toBeGreaterThan(MAP_Z_POLYLINE);
  });

  it('nudges overlapping driver away from restaurant (display only)', () => {
    const restaurant = { latitude: 45.4215, longitude: -75.6972 };
    const driverOnTop = { latitude: 45.4215, longitude: -75.6972 };
    const nudged = offsetIfOverlapping(driverOnTop, restaurant);
    expect(nudged).not.toBeNull();
    expect(nudged!.latitude).toBeGreaterThan(restaurant.latitude);
    expect(nudged!.longitude).toBeGreaterThan(restaurant.longitude);
  });

  it('does not nudge when pins are far apart', () => {
    const restaurant = { latitude: 45.4215, longitude: -75.6972 };
    const driver = { latitude: 45.43, longitude: -75.68 };
    expect(offsetIfOverlapping(driver, restaurant)).toEqual(driver);
  });

  it('offsetDriverFromStops picks nearest stop', () => {
    const driver = { latitude: 45.4215, longitude: -75.6972 };
    const near = { latitude: 45.42151, longitude: -75.69721 };
    const far = { latitude: 45.45, longitude: -75.65 };
    const out = offsetDriverFromStops(driver, [far, near]);
    expect(out).not.toEqual(driver);
    expect(MAP_OVERLAP_THRESHOLD_KM).toBeGreaterThan(0);
  });
});
