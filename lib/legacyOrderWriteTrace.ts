/**
 * Detects direct Firestore order writes that bypass protectedUpdateOrder.
 * Search logs for `[LEGACY ORDER WRITER DETECTED]`.
 *
 * HalfOrder social orders still use `directUpdateOrder` by design (separate
 * status vocabulary from marketplace). Those sources are allowlisted so the
 * terminal only surfaces unexpected marketplace lifecycle bypasses.
 */
const EXPECTED_LEGACY_LIFECYCLE_SOURCES = new Set([
  'halfOrderLifecycle.ts#markHalfOrderChatActive',
  'halfOrderLifecycle.ts#completeHalfOrder',
  'halfOrderCancel.ts#cancelHalfOrder',
  // Unpaid checkout reuse may need to force courier status back to pending;
  // protectedUpdateOrder would block that as a downgrade.
  'services/orderService.ts#createOrder:reuseUnpaid:resetDeliveryStatus',
]);

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

  if (EXPECTED_LEGACY_LIFECYCLE_SOURCES.has(source)) return;

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
