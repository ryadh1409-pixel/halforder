import { canCustomerCancelMarketplaceOrder } from '@/lib/customerOrderCancelUx';
import {
  CUSTOMER_DELIVERY_STAGE,
  customerDeliveryStageLabel,
  resolveCustomerDeliveryStage,
} from '@/lib/customerDeliveryStatus';
import {
  customerTrackStepLabel,
  resolveCustomerTrackStep,
} from '@/lib/customerTrackStatus';
import type { OrderStageInput } from '@/services/orderStage';

/** Kitchen statuses shown in Profile → Your Orders (last 24h). No status filter on Firestore query. */
export const PROFILE_VISIBLE_ORDER_STATUSES = [
  'awaiting_payment',
  'payment_processing',
  'payment_confirmed',
  'pending',
  'pending_driver',
  'accepted',
  'restaurant_accepted',
  'preparing',
  'ready',
  'ready_for_pickup',
  'driver_assigned',
  'driver_at_restaurant',
  'picked_up',
  'on_the_way',
  'arrived_customer',
  'delivered',
  'completed',
  'cancelled',
] as const;

export function isProfileOrderVisibleStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (PROFILE_VISIBLE_ORDER_STATUSES as readonly string[]).includes(s);
}

export type ProfileOrderBadgeTone = 'orange' | 'blue' | 'green' | 'red' | 'neutral';

export type ProfileOrderStatusInput = OrderStageInput & {
  status?: string;
  deliveryStatus?: string | null;
  paymentStatus?: string | null;
  driverId?: string | null;
  assignedDriverId?: string | null;
  id?: string;
};

function profileOrderStageInput(
  status: string,
  deliveryStatus?: string | null,
  paymentStatus?: string | null,
  driverContext?: {
    driverId?: string | null;
    assignedDriverId?: string | null;
    orderId?: string;
  },
): ProfileOrderStatusInput {
  return {
    id: driverContext?.orderId,
    status,
    deliveryStatus,
    paymentStatus,
    driverId: driverContext?.driverId ?? null,
    assignedDriverId: driverContext?.assignedDriverId ?? null,
  };
}

export function profileOrderStatusLabel(
  status: string,
  deliveryStatus?: string | null,
  paymentStatus?: string | null,
  driverContext?: {
    driverId?: string | null;
    assignedDriverId?: string | null;
    orderId?: string;
  },
): string {
  const order = profileOrderStageInput(status, deliveryStatus, paymentStatus, driverContext);
  const courierStage = resolveCustomerDeliveryStage(order);
  if (courierStage) {
    return customerDeliveryStageLabel(courierStage);
  }

  const ps = (paymentStatus ?? '').trim().toLowerCase();
  const paid = ps === 'paid';

  if (paid && (status === 'awaiting_payment' || status === 'payment_processing')) {
    return 'Payment confirmed';
  }

  const ds = (deliveryStatus ?? '').trim();
  if (ds === 'waiting_driver') return 'Finding Driver';
  if (status === 'payment_processing') return 'Processing payment';
  if (status === 'delivered' || status === 'completed' || ds === 'delivered') return 'Delivered';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'pending_driver') return 'Finding Driver';
  if (status === 'accepted' || status === 'restaurant_accepted' || status === 'preparing') {
    return 'Preparing';
  }
  if (status === 'ready' || status === 'ready_for_pickup') return 'Ready for pickup';
  if (status === 'payment_confirmed') return 'Payment confirmed';
  if (status === 'awaiting_payment') return paid ? 'Payment confirmed' : 'Awaiting payment';
  return customerTrackStepLabel(resolveCustomerTrackStep(order));
}

export function profileOrderBadgeTone(
  status: string,
  deliveryStatus?: string | null,
): ProfileOrderBadgeTone {
  const ds = (deliveryStatus ?? '').trim();
  if (status === 'delivered' || ds === 'delivered' || status === 'completed') return 'green';
  if (status === 'cancelled') return 'red';
  if (status === 'payment_processing') return 'orange';
  if (status === 'pending_driver' || ds === 'waiting_driver') return 'orange';
  if (
    ds === 'driver_assigned' ||
    ds === 'ready_for_pickup' ||
    ds === 'driver_at_restaurant' ||
    ds === 'picked_up' ||
    ds === 'on_the_way'
  ) {
    return 'orange';
  }
  switch (status) {
    case 'driver_assigned':
    case 'arriving_restaurant':
    case 'picked_up_pending':
    case 'on_the_way':
    case 'arrived_customer':
    case 'picked_up':
    case 'awaiting_payment':
    case 'payment_processing':
    case 'pending_driver':
    case 'accepted':
    case 'restaurant_accepted':
    case 'preparing':
    case 'ready':
    case 'ready_for_pickup':
      return 'orange';
    default:
      return 'neutral';
  }
}

export function profileOrderStatusIcon(
  status: string,
  deliveryStatus?: string | null,
  driverContext?: {
    driverId?: string | null;
    assignedDriverId?: string | null;
  },
): string {
  const courierStage = resolveCustomerDeliveryStage({
    status,
    deliveryStatus,
    driverId: driverContext?.driverId ?? null,
    assignedDriverId: driverContext?.assignedDriverId ?? null,
  });

  if (courierStage === CUSTOMER_DELIVERY_STAGE.DELIVERED) return 'check-circle';
  if (status === 'cancelled' || deliveryStatus === 'cancelled') return 'highlight-off';
  if (status === 'payment_processing') return 'payments';
  if (courierStage === CUSTOMER_DELIVERY_STAGE.DRIVER_ASSIGNED) return 'person-pin-circle';
  if (
    courierStage === CUSTOMER_DELIVERY_STAGE.PICKED_UP ||
    courierStage === CUSTOMER_DELIVERY_STAGE.DRIVER_AT_RESTAURANT
  ) {
    return 'delivery-dining';
  }
  if (status === 'pending_driver' || deliveryStatus === 'waiting_driver') return 'local-shipping';
  return 'schedule';
}

export function isProfileOrderCancelled(
  order: { status?: string | null; deliveryStatus?: string | null },
): boolean {
  const status = typeof order.status === 'string' ? order.status.trim().toLowerCase() : '';
  const ds =
    typeof order.deliveryStatus === 'string' ? order.deliveryStatus.trim().toLowerCase() : '';
  return status === 'cancelled' || ds === 'cancelled';
}

export function profileOrderStatusActive(
  status: string,
  deliveryStatus?: string | null,
  driverContext?: {
    driverId?: string | null;
    assignedDriverId?: string | null;
  },
): boolean {
  const ds = (deliveryStatus ?? '').trim();
  if (status === 'delivered' || status === 'cancelled' || status === 'completed' || ds === 'delivered') {
    return false;
  }

  const courierStage = resolveCustomerDeliveryStage({
    status,
    deliveryStatus,
    driverId: driverContext?.driverId ?? null,
    assignedDriverId: driverContext?.assignedDriverId ?? null,
  });
  if (courierStage && courierStage !== CUSTOMER_DELIVERY_STAGE.DELIVERED) {
    return true;
  }

  return (
    status === 'payment_processing' ||
    status === 'pending_driver' ||
    ds === 'waiting_driver' ||
    status === 'preparing'
  );
}

export function canCancelProfileOrder(
  order: OrderStageInput & { status?: string; deliveryStatus?: string | null; paymentStatus?: string | null },
): boolean {
  return canCustomerCancelMarketplaceOrder(order);
}
