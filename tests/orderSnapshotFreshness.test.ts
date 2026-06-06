import {
  OrderSnapshotFreshnessGate,
  QuerySnapshotFreshnessGate,
  resolveOrderFreshnessMs,
} from '@/lib/orderSnapshotFreshness';

describe('orderSnapshotFreshness', () => {
  it('resolveOrderFreshnessMs prefers latest lifecycle timestamp', () => {
    expect(
      resolveOrderFreshnessMs({
        updatedAt: { seconds: 10 },
        deliveredAt: { seconds: 100 },
      }),
    ).toBe(100_000);
  });

  it('allows cache bootstrap then ignores stale cache after server snapshot', () => {
    const gate = new OrderSnapshotFreshnessGate();

    expect(
      gate.shouldApply(
        { status: 'payment_confirmed', deliveryStatus: 'driver_assigned', updatedAt: { seconds: 1 } },
        { fromCache: true, hasPendingWrites: false },
      ),
    ).toBe(true);

    expect(
      gate.shouldApply(
        {
          status: 'completed',
          deliveryStatus: 'delivered',
          updatedAt: { seconds: 5 },
          deliveredAt: { seconds: 5 },
        },
        { fromCache: false, hasPendingWrites: false },
      ),
    ).toBe(true);

    expect(
      gate.shouldApply(
        { status: 'payment_confirmed', deliveryStatus: 'driver_assigned', updatedAt: { seconds: 1 } },
        { fromCache: true, hasPendingWrites: false },
      ),
    ).toBe(false);
  });

  it('QuerySnapshotFreshnessGate ignores cache after server query snapshot', () => {
    const gate = new QuerySnapshotFreshnessGate();
    expect(gate.shouldApply(true)).toBe(true);
    expect(gate.shouldApply(false)).toBe(true);
    expect(gate.shouldApply(true)).toBe(false);
  });
});
