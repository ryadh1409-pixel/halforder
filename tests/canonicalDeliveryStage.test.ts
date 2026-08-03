import {
  canonicalDeliveryStatusLabel,
  marketplaceDeliveryStatusLabel,
  resolveCanonicalDeliveryDisplayStage,
} from '@/lib/canonicalDeliveryStage';

describe('canonicalDeliveryStage', () => {
  it('maps picked_up to Picked up for every shared label helper', () => {
    expect(canonicalDeliveryStatusLabel('picked_up')).toBe('Picked up');
    expect(marketplaceDeliveryStatusLabel('picked_up')).toBe('Picked up');
  });

  it('preserves fine-grained on_the_way and nearby before normalize collapse', () => {
    expect(resolveCanonicalDeliveryDisplayStage('on_the_way')).toBe('on_the_way');
    expect(canonicalDeliveryStatusLabel('on_the_way')).toBe('On the way');
    expect(resolveCanonicalDeliveryDisplayStage('near_customer')).toBe('nearby');
    expect(canonicalDeliveryStatusLabel('near_customer')).toBe('Nearby');
  });

  it('maps ready_for_pickup and driver_assigned to required driver stages', () => {
    expect(canonicalDeliveryStatusLabel('ready_for_pickup')).toBe(
      'Waiting at restaurant',
    );
    expect(canonicalDeliveryStatusLabel('driver_assigned')).toBe('Driver assigned');
    expect(canonicalDeliveryStatusLabel('delivered')).toBe('Delivered');
  });
});
