/**
 * Tests for presentation-only customer approach camera helpers.
 */
import {
  APPROACH_NEARBY_RADIUS_M,
  formatRouteEtaBadge,
  resolveCustomerMapCameraMode,
  selectCameraFocusPoints,
  shouldRefitApproachCamera,
} from '@/lib/maps/customerApproachCamera';

describe('customerApproachCamera', () => {
  it('uses approach mode when heading to customer on_the_way', () => {
    expect(
      resolveCustomerMapCameraMode({
        step: 'on_the_way',
        leg: 'to_customer',
        driverCustomerMeters: 1200,
      }),
    ).toBe('approach');
  });

  it('uses arriving mode for driver_nearby without inventing states', () => {
    expect(
      resolveCustomerMapCameraMode({
        step: 'driver_nearby',
        leg: 'to_customer',
        driverCustomerMeters: 800,
      }),
    ).toBe('arriving');
  });

  it('tightens camera by distance while still on_the_way', () => {
    expect(
      resolveCustomerMapCameraMode({
        step: 'on_the_way',
        leg: 'to_customer',
        driverCustomerMeters: APPROACH_NEARBY_RADIUS_M - 10,
      }),
    ).toBe('arriving');
  });

  it('frames restaurant + driver before pickup', () => {
    expect(
      resolveCustomerMapCameraMode({
        step: 'waiting_at_restaurant',
        leg: 'to_restaurant',
        driverCustomerMeters: null,
      }),
    ).toBe('to_restaurant');
  });

  it('selects driver + customer points in approach', () => {
    const pts = selectCameraFocusPoints({
      mode: 'approach',
      restaurant: { latitude: 1, longitude: 1 },
      driver: { latitude: 2, longitude: 2 },
      customer: { latitude: 3, longitude: 3 },
    });
    expect(pts).toEqual([
      { latitude: 2, longitude: 2 },
      { latitude: 3, longitude: 3 },
    ]);
  });

  it('formats ETA badge copy', () => {
    expect(formatRouteEtaBadge(2, 'approach')).toBe('2 min away');
    expect(formatRouteEtaBadge(1, 'arriving')).toBe('1 min away');
    expect(formatRouteEtaBadge(0, 'arriving')).toBe('Arriving');
    expect(formatRouteEtaBadge(5, 'to_restaurant')).toBeNull();
  });

  it('avoids camera thrash for tiny driver moves', () => {
    expect(
      shouldRefitApproachCamera({
        tracking: true,
        modeChanged: false,
        force: false,
        lastFitDriver: { latitude: 25.0, longitude: 55.0 },
        driver: { latitude: 25.0002, longitude: 55.0 },
        minMoveMeters: 55,
      }),
    ).toBe(false);
  });
});
