/**
 * Verbose order stage tracing (render/snapshot logs).
 * Opt in with EXPO_PUBLIC_ENABLE_ORDER_TRACE=1 — keeps Metro quiet by default.
 *
 * Always-on logs (not gated): ORDER WRITE TRACE, DOWNGRADE BLOCKED,
 * [ORDER STAGE] ignoring stale snapshot regression.
 */
export const ENABLE_ORDER_TRACE =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_ENABLE_ORDER_TRACE === '1';
