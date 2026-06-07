import {
  CUSTOMER_DELIVERY_STAGE,
  customerDeliveryStageLabel,
  resolveCustomerDeliveryStage,
} from '@/lib/customerDeliveryStatus';
import { resolveCustomerTrackStep } from '@/lib/customerTrackStatus';

describe('resolveCustomerDeliveryStage', () => {
  it('maps driver_assigned', () => {
    expect(
      resolveCustomerDeliveryStage({
        deliveryStatus: 'driver_assigned',
        driverId: 'd1',
      }),
    ).toBe(CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED);
  });

  it('maps ready_for_pickup with driver to driver_at_restaurant', () => {
    expect(
      resolveCustomerDeliveryStage({
        status: 'ready_for_pickup',
        deliveryStatus: 'ready_for_pickup',
        driverId: 'd1',
      }),
    ).toBe(CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT);
    expect(customerDeliveryStageLabel(CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT)).toBe(
      'Driver at restaurant',
    );
  });

  it('maps driver_at_restaurant alias to driver_at_restaurant', () => {
    expect(
      resolveCustomerDeliveryStage({
        deliveryStatus: 'driver_at_restaurant',
        driverId: 'd1',
      }),
    ).toBe(CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT);
  });

  it('does not map ready_for_pickup without driver to courier stage', () => {
    expect(
      resolveCustomerDeliveryStage({
        status: 'ready_for_pickup',
        deliveryStatus: 'waiting_driver',
      }),
    ).toBeNull();
  });

  it('maps picked_up and delivered', () => {
    expect(
      resolveCustomerDeliveryStage({
        deliveryStatus: 'picked_up',
        driverId: 'd1',
      }),
    ).toBe(CUSTOMER_DELIVERY_STAGE.PICKED_UP);
    expect(
      resolveCustomerDeliveryStage({
        status: 'completed',
        deliveryStatus: 'delivered',
        driverId: 'd1',
      }),
    ).toBe(CUSTOMER_DELIVERY_STAGE.DELIVERED);
  });
});

describe('customer track step alignment', () => {
  it('aligns track step with canonical delivery stage for ready_for_pickup + driver', () => {
    const order = {
      id: 'o1',
      status: 'payment_confirmed',
      deliveryStatus: 'ready_for_pickup',
      driverId: 'd1',
    };
    expect(resolveCustomerDeliveryStage(order)).toBe(
      CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT,
    );
    expect(resolveCustomerTrackStep(order)).toBe('driver_at_restaurant');
  });
});
