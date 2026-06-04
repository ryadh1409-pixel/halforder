import { customerOrderDetailHref } from '@/lib/customerOrderNavigation';
import type { Href } from 'expo-router';

/** Post-payment live tracking — DoorDash-style customer screen. */
export function postPaymentLiveOrderHref(orderId: string): Href {
  const id = orderId.trim();
  return `/track-order/${encodeURIComponent(id)}` as Href;
}

/** Order details fallback when live tracking cannot hydrate. */
export function postPaymentOrderDetailsHref(orderId: string): Href {
  return customerOrderDetailHref(orderId);
}

export function logPaymentNavigation(
  event: string,
  meta?: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      msg: 'payment_navigation',
      event,
      ts: Date.now(),
      ...meta,
    }),
  );
}
