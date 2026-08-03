import {
  resolveActiveCustomerStop,
  resolveDeliveryCustomerStops,
  resolveDeliveryRestaurantStop,
  type DeliveryStopSource,
} from '@/lib/maps/deliveryStops';

function source(partial: Partial<DeliveryStopSource> & { id: string }): DeliveryStopSource {
  return {
    groupId: null,
    status: 'driver_assigned',
    deliveryStatus: 'driver_assigned',
    restaurantName: 'Test Kitchen',
    restaurantLocation: { lat: 43.65, lng: -79.38 },
    customerName: null,
    customerLocation: null,
    ...partial,
  };
}

describe('deliveryStops', () => {
  it('resolves a single customer for a normal delivery', () => {
    const customers = resolveDeliveryCustomerStops(
      source({
        id: 'o1',
        customerName: 'Alex Rivera',
        customerLocation: { lat: 43.67, lng: -79.4 },
      }),
    );
    expect(customers).toHaveLength(1);
    expect(customers[0].label).toBe('Alex');
    expect(customers[0].coordinate.latitude).toBeCloseTo(43.67);
  });

  it('merges group siblings into multiple customer markers', () => {
    const primary = source({
      id: 'o1',
      groupId: 'grp_1',
      customerName: 'Alex',
      customerLocation: { lat: 43.67, lng: -79.4 },
      createdAtMs: 1,
    });
    const sibling = source({
      id: 'o2',
      groupId: 'grp_1',
      customerName: 'Blake',
      customerLocation: { lat: 43.68, lng: -79.41 },
      createdAtMs: 2,
    });
    const customers = resolveDeliveryCustomerStops(primary, [sibling]);
    expect(customers).toHaveLength(2);
    expect(customers.map((c) => c.label)).toEqual(['Alex', 'Blake']);
  });

  it('reads forward-compatible deliveryStops arrays', () => {
    const customers = resolveDeliveryCustomerStops(
      source({
        id: 'o1',
        deliveryStops: [
          { id: 'a', name: 'Casey', lat: 43.7, lng: -79.5 },
          { id: 'b', name: 'Drew', latitude: 43.71, longitude: -79.51 },
        ],
      }),
    );
    expect(customers).toHaveLength(2);
    expect(customers[0].label).toBe('Casey');
    expect(customers[1].label).toBe('Drew');
  });

  it('picks the first undelivered customer after pickup', () => {
    const customers = resolveDeliveryCustomerStops(
      source({ id: 'o1', groupId: 'g', customerName: 'A', customerLocation: { lat: 1, lng: 1 }, createdAtMs: 1 }),
      [
        source({
          id: 'o2',
          groupId: 'g',
          customerName: 'B',
          customerLocation: { lat: 2, lng: 2 },
          createdAtMs: 2,
          status: 'delivered',
          deliveryStatus: 'delivered',
        }),
        source({
          id: 'o3',
          groupId: 'g',
          customerName: 'C',
          customerLocation: { lat: 3, lng: 3 },
          createdAtMs: 3,
        }),
      ],
    );
    // o2 delivered — still appears but active destination skips it
    const active = resolveActiveCustomerStop(customers, 'picked_up', 'picked_up');
    expect(active?.label).toBe('A');
  });

  it('resolves restaurant stop', () => {
    const stop = resolveDeliveryRestaurantStop(
      source({ id: 'o1', restaurantLocation: { lat: 43.65, lng: -79.38 } }),
    );
    expect(stop?.kind).toBe('restaurant');
    expect(stop?.label).toBe('Test Kitchen');
  });

  it('adds a peer pickup stop when distinct from restaurant (food-share)', () => {
    const customers = resolveDeliveryCustomerStops(
      source({
        id: 'fs1',
        pickupName: 'Sam Host',
        pickupLat: 43.66,
        pickupLng: -79.39,
        dropoffName: 'Jordan Guest',
        dropoffLat: 43.67,
        dropoffLng: -79.4,
        restaurantLocation: { lat: 43.65, lng: -79.38 },
      }),
    );
    expect(customers).toHaveLength(2);
    expect(customers.map((c) => c.label)).toEqual(['Sam', 'Jordan']);
  });

  it('does not treat restaurant-equal pickup as a second customer', () => {
    const customers = resolveDeliveryCustomerStops(
      source({
        id: 'o1',
        pickupName: 'Kitchen',
        pickupLat: 43.65,
        pickupLng: -79.38,
        customerName: 'Alex',
        customerLocation: { lat: 43.67, lng: -79.4 },
        restaurantLocation: { lat: 43.65, lng: -79.38 },
      }),
    );
    expect(customers).toHaveLength(1);
    expect(customers[0].label).toBe('Alex');
  });
});
