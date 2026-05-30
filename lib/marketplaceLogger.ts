/**
 * Structured dev/prod-safe logging for marketplace driver pool flows.
 */

type MarketplaceLogPayload = Record<string, unknown>;

function log(level: 'info' | 'warn' | 'error', event: string, payload?: MarketplaceLogPayload) {
  const line = `[marketplace] ${event}`;
  if (level === 'error') {
    console.error(line, payload ?? '');
    return;
  }
  if (level === 'warn') {
    console.warn(line, payload ?? '');
    return;
  }
  if (__DEV__ || payload?.forceProd === true) {
    console.log(line, payload ?? '');
  }
}

export const marketplaceLog = {
  syncUpsert: (orderId: string, payload?: MarketplaceLogPayload) =>
    log('info', 'pool_sync_upsert', { orderId, ...payload }),
  syncRemove: (orderId: string, payload?: MarketplaceLogPayload) =>
    log('info', 'pool_sync_remove', { orderId, ...payload }),
  listenerUpdate: (count: number, payload?: MarketplaceLogPayload) =>
    log('info', 'driver_listener_update', { count, ...payload }),
  acceptStart: (orderId: string, payload?: MarketplaceLogPayload) =>
    log('info', 'driver_accept_start', { orderId, ...payload }),
  acceptSuccess: (orderId: string, payload?: MarketplaceLogPayload) =>
    log('info', 'driver_accept_success', { orderId, ...payload }),
  acceptFailed: (orderId: string, payload?: MarketplaceLogPayload) =>
    log('warn', 'driver_accept_failed', { orderId, ...payload }),
  acceptError: (orderId: string, error: unknown, payload?: MarketplaceLogPayload) =>
    log('error', 'driver_accept_error', {
      orderId,
      message: error instanceof Error ? error.message : String(error),
      ...payload,
    }),
  stalePoolEntry: (orderId: string, payload?: MarketplaceLogPayload) =>
    log('warn', 'stale_pool_entry_filtered', { orderId, ...payload }),
  expired: (orderId: string, payload?: MarketplaceLogPayload) =>
    log('warn', '[marketplace-expired]', { orderId, ...payload, forceProd: true }),
  cleanup: (payload?: MarketplaceLogPayload) =>
    log('info', '[marketplace-cleanup]', { ...payload, forceProd: true }),
  remove: (orderId: string, payload?: MarketplaceLogPayload) =>
    log('info', '[marketplace-remove]', { orderId, ...payload, forceProd: true }),
  queryFilter: (orderId: string, payload?: MarketplaceLogPayload) =>
    log('info', '[driver-query-filter]', { orderId, ...payload }),
};
