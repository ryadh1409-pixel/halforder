import { criticalOrderAlertKey } from '@/constants/criticalOrderAlert';

describe('criticalOrderAlertKey', () => {
  it('dedupes by role + event + orderId', () => {
    expect(criticalOrderAlertKey('restaurant', 'new_order', 'abc')).toBe(
      'restaurant:new_order:abc',
    );
    expect(
      criticalOrderAlertKey('driver', 'ready_for_pickup', ' abc '),
    ).toBe('driver:ready_for_pickup:abc');
  });

  it('keeps admin / restaurant / driver namespaces distinct', () => {
    const a = criticalOrderAlertKey('admin', 'new_order', 'o1');
    const r = criticalOrderAlertKey('restaurant', 'new_order', 'o1');
    const d = criticalOrderAlertKey('driver', 'ready_for_pickup', 'o1');
    expect(new Set([a, r, d]).size).toBe(3);
  });
});
