/**
 * Temporary trace for direct Firestore order writes that bypass protectedUpdateOrder.
 * Search Metro logs for `[LEGACY ORDER WRITE]`.
 */
export function traceLegacyOrderWrite(
  source: string,
  orderId: string,
  patch: Record<string, unknown>,
): void {
  const hasLifecycle =
    patch.status !== undefined ||
    patch.deliveryStatus !== undefined ||
    patch.paymentStatus !== undefined;

  if (!hasLifecycle) return;

  console.log('[LEGACY ORDER WRITE]', {
    source,
    orderId,
    patch,
    stack: new Error().stack,
  });
}
