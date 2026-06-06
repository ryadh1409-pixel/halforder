/** Driver share of delivery fee (Uber-style). */
export const DRIVER_EARNING_PERCENT = 0.8;

const DEFAULT_DELIVERY_FEE = 0.99;

export function resolveOrderDeliveryFee(data: {
  deliveryFee?: unknown;
  fees?: unknown;
}): number {
  if (typeof data.deliveryFee === 'number' && Number.isFinite(data.deliveryFee) && data.deliveryFee > 0) {
    return data.deliveryFee;
  }
  if (typeof data.fees === 'number' && Number.isFinite(data.fees) && data.fees > 0) {
    return data.fees;
  }
  return DEFAULT_DELIVERY_FEE;
}

export function calculateDriverEarningForOrder(data: {
  deliveryFee?: unknown;
  fees?: unknown;
}): number {
  const fee = resolveOrderDeliveryFee(data);
  return Math.round(fee * DRIVER_EARNING_PERCENT * 100) / 100;
}

export function isSameLocalDay(ms: number | null | undefined, nowMs: number = Date.now()): boolean {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return false;
  const d = new Date(ms);
  const n = new Date(nowMs);
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}
