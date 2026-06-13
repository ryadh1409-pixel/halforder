import {
  buildLifecycleConsistencyRepairPatch,
  syncMarketplaceLifecyclePatch,
} from '@/lib/marketplaceLifecycleSync';
import { sanitizeOrderPatchAgainstRegression } from '@/services/orderStage';
import type { OrderStageInput } from '@/services/orderStage';

describe('syncMarketplaceLifecyclePatch', () => {
  it('pairs status when patch advances deliveryStatus only', () => {
    const safe = syncMarketplaceLifecyclePatch(
      sanitizeOrderPatchAgainstRegression(
        {
          id: 'uMIF',
          status: 'payment_confirmed',
          deliveryStatus: 'pending',
          paymentStatus: 'paid',
        },
        { deliveryStatus: 'ready_for_pickup' },
      ),
      {
        id: 'uMIF',
        status: 'payment_confirmed',
        deliveryStatus: 'pending',
        paymentStatus: 'paid',
      },
    );
    expect(safe.deliveryStatus).toBe('ready_for_pickup');
    expect(safe.status).toBe('ready_for_pickup');
  });

  it('pairs driver_assigned when claim assigns driver on ready_for_pickup courier', () => {
    const current: OrderStageInput = {
      id: 'uMIF',
      status: 'payment_confirmed',
      deliveryStatus: 'ready_for_pickup',
      paymentStatus: 'paid',
    };
    const synced = syncMarketplaceLifecyclePatch(
      {
        driverId: 'drv1',
        assignedDriverId: 'drv1',
        deliveryStatus: 'driver_assigned',
        status: 'driver_assigned',
      },
      current,
    );
    expect(synced.status).toBe('driver_assigned');
    expect(synced.deliveryStatus).toBe('driver_assigned');
  });

  it('builds repair patch for uMIF inconsistent production state', () => {
    const repair = buildLifecycleConsistencyRepairPatch({
      id: 'uMIFqPqbxlE9AjNp7dAx',
      status: 'payment_confirmed',
      deliveryStatus: 'ready_for_pickup',
      paymentStatus: 'paid',
      driverId: '9XN334yG4hOglrOYfsehHPDM5zP2',
      assignedDriverId: '9XN334yG4hOglrOYfsehHPDM5zP2',
    });
    expect(repair).toEqual({
      status: 'driver_assigned',
      deliveryStatus: 'driver_assigned',
    });
  });
});
