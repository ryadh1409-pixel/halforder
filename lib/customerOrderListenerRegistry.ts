const activeCustomerOrderListeners = new Map<string, Set<string>>();

/** Tracks concurrent `orders/{id}` customer listeners to surface duplicate subscriptions. */
export function registerCustomerOrderListener(
  orderId: string,
  listenerInstanceId: string,
): { duplicate: boolean; activeCount: number } {
  const id = orderId.trim();
  if (!id) return { duplicate: false, activeCount: 0 };

  let instances = activeCustomerOrderListeners.get(id);
  if (!instances) {
    instances = new Set();
    activeCustomerOrderListeners.set(id, instances);
  }
  const duplicate = instances.size > 0;
  instances.add(listenerInstanceId);

  console.log('[CUSTOMER LISTENER]', {
    action: duplicate ? 'duplicate_attach' : 'attach',
    orderId: id,
    listenerInstanceId,
    activeCount: instances.size,
  });

  return { duplicate, activeCount: instances.size };
}

export function unregisterCustomerOrderListener(
  orderId: string,
  listenerInstanceId: string,
): void {
  const id = orderId.trim();
  if (!id) return;

  const instances = activeCustomerOrderListeners.get(id);
  if (!instances) return;

  instances.delete(listenerInstanceId);
  if (instances.size === 0) {
    activeCustomerOrderListeners.delete(id);
  }

  console.log('[CUSTOMER LISTENER]', {
    action: 'detach',
    orderId: id,
    listenerInstanceId,
    activeCount: instances.size,
  });
}
