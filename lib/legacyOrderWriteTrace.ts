/**
 * Detects direct Firestore order writes that bypass protectedUpdateOrder.
 * Search logs for `[LEGACY ORDER WRITER DETECTED]`.
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

  const stack = new Error().stack ?? '';
  const file = source.split('#')[0] ?? source;
  const fn = source.split('#')[1] ?? '(unknown)';

  console.warn('[LEGACY ORDER WRITER DETECTED]', {
    file,
    function: fn,
    source,
    orderId,
    patch,
    stack,
  });
}
