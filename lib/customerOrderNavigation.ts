import type { Href } from 'expo-router';

/**
 * Root-stack marketplace order detail (`app/order/[id].tsx`).
 * Must be a string href — only `app/order/[id].tsx` (never a `(driver)/order` duplicate).
 */
export function customerOrderDetailHref(orderId: string): Href {
  const id = orderId.trim();
  if (!id) return '/(tabs)' as Href;
  return `/order/${encodeURIComponent(id)}` as Href;
}
