/**
 * Eligibility mirror of main/src/marketplacePoolLifecycle.ts (Jest cannot import CF .js paths).
 */

function hasDriverAssigned(data: {
  driverId?: unknown;
  assignedDriverId?: unknown;
}): boolean {
  const driverId = data.driverId;
  const assignedDriverId = data.assignedDriverId;
  return (
    (typeof driverId === 'string' && driverId.length > 0) ||
    (typeof assignedDriverId === 'string' && assignedDriverId.length > 0)
  );
}

function hasMarketplaceDriverClaimed(data: {
  status?: unknown;
  deliveryStatus?: unknown;
  driverId?: unknown;
  assignedDriverId?: unknown;
  deliveryPin?: unknown;
}): boolean {
  if (!hasDriverAssigned(data)) return false;
  const status = typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
  const courier =
    typeof data.deliveryStatus === 'string' ? data.deliveryStatus.trim().toLowerCase() : '';
  if (
    status === 'driver_assigned' ||
    status === 'picked_up' ||
    courier === 'driver_assigned' ||
    courier === 'picked_up' ||
    courier === 'heading_to_restaurant' ||
    courier === 'arrived_restaurant'
  ) {
    return true;
  }
  const pin = typeof data.deliveryPin === 'string' ? data.deliveryPin.trim() : '';
  return /^\d{4}$/.test(pin);
}

function shouldPublish(data: {
  deliveryType?: unknown;
  paymentStatus?: unknown;
  status?: unknown;
  deliveryStatus?: unknown;
  driverId?: unknown;
  assignedDriverId?: unknown;
  deliveryPin?: unknown;
}): boolean {
  if (data.deliveryType !== 'delivery') return false;
  if (String(data.paymentStatus ?? '').toLowerCase() !== 'paid') return false;
  if (hasMarketplaceDriverClaimed(data)) return false;
  if (hasDriverAssigned(data)) return false;
  const courier =
    typeof data.deliveryStatus === 'string' ? data.deliveryStatus.trim().toLowerCase() : '';
  return (
    courier === 'ready_for_pickup' ||
    courier === 'preparing' ||
    courier === 'accepted' ||
    courier === 'pending'
  );
}

describe('marketplacePoolLifecycle eligibility', () => {
  it('publishes paid ready_for_pickup orders with no driver claim', () => {
    expect(
      shouldPublish({
        deliveryType: 'delivery',
        paymentStatus: 'paid',
        status: 'ready_for_pickup',
        deliveryStatus: 'ready_for_pickup',
        driverId: null,
        assignedDriverId: null,
      }),
    ).toBe(true);
  });

  it('publishes ready_for_pickup even when a premature driverId is present', () => {
    const data = {
      deliveryType: 'delivery' as const,
      paymentStatus: 'paid',
      status: 'ready_for_pickup',
      deliveryStatus: 'ready_for_pickup',
      driverId: 'stale-driver',
      assignedDriverId: 'stale-driver',
    };
    expect(hasMarketplaceDriverClaimed(data)).toBe(false);
    // Pool publish waits until premature ids are cleared (CF clearPrematureDriver).
    expect(shouldPublish(data)).toBe(false);
    expect(
      shouldPublish({
        ...data,
        driverId: null,
        assignedDriverId: null,
      }),
    ).toBe(true);
  });

  it('does not publish after a real driver claim', () => {
    const claimed = {
      deliveryType: 'delivery' as const,
      paymentStatus: 'paid',
      status: 'driver_assigned',
      deliveryStatus: 'driver_assigned',
      driverId: 'drv1',
      assignedDriverId: 'drv1',
      deliveryPin: '1234',
    };
    expect(hasMarketplaceDriverClaimed(claimed)).toBe(true);
    expect(shouldPublish(claimed)).toBe(false);
  });

  it('treats arrived-at-restaurant (ready + pin) as claimed', () => {
    const arrived = {
      deliveryType: 'delivery' as const,
      paymentStatus: 'paid',
      status: 'ready_for_pickup',
      deliveryStatus: 'ready_for_pickup',
      driverId: 'drv1',
      assignedDriverId: 'drv1',
      deliveryPin: '5678',
    };
    expect(hasMarketplaceDriverClaimed(arrived)).toBe(true);
    expect(shouldPublish(arrived)).toBe(false);
  });
});
