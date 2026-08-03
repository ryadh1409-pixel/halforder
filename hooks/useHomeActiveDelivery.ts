/**
 * Home active-delivery presentation — reuses existing profile order feed +
 * subscribeOrderById. No new Firestore listeners beyond what hooks already own.
 */
import { useLiveOrderTracking } from '@/hooks/useLiveOrderTracking';
import { useProfileOrders, type ProfileOrderRow } from '@/hooks/useProfileOrders';
import { resolveCustomerTrackStep, customerTrackStepLabel } from '@/lib/customerTrackStatus';
import { auth } from '@/services/firebase';
import { useMemo } from 'react';

function isPaidActive(row: ProfileOrderRow): boolean {
  const pay = row.paymentStatus.trim().toLowerCase();
  const status = row.status.trim().toLowerCase();
  if (pay === 'unpaid' || pay === 'pending' || pay === 'failed') {
    if (status !== 'payment_confirmed' && status !== 'pending_driver' && status !== 'accepted') {
      return false;
    }
  }
  if (status === 'awaiting_payment' || status === 'pending_payment') return false;
  return true;
}

export function useHomeActiveDelivery() {
  const uid = auth.currentUser?.uid ?? null;
  const { activeRows, loading: listLoading } = useProfileOrders(uid);

  const primary = useMemo(() => {
    const paid = activeRows.filter(isPaidActive);
    // Prefer marketplace over food_share for the floating delivery card.
    const marketplace = paid.find((r) => r.source !== 'food_share');
    return marketplace ?? paid[0] ?? null;
  }, [activeRows]);

  const live = useLiveOrderTracking(primary?.id ?? null);

  const statusLabel = useMemo(() => {
    if (!live.order) {
      return primary ? customerTrackStepLabel(resolveCustomerTrackStep(primary)) : null;
    }
    return customerTrackStepLabel(resolveCustomerTrackStep(live.order));
  }, [live.order, primary]);

  return {
    orderId: primary?.id ?? null,
    profileRow: primary,
    order: live.order,
    loading: listLoading || (Boolean(primary?.id) && live.loading),
    statusLabel,
    driverLocation: live.driverLocation,
    restaurantLocation: live.restaurantLocation,
    customerLocation: live.customerLocation,
  };
}
