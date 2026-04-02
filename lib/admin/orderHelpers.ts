/** Creator / host uid for `orders` documents (schema varies). */
export function orderCreatorUid(data: Record<string, unknown>): string {
  const v =
    data.createdBy ?? data.hostId ?? data.creatorId ?? data.userId ?? '';
  return typeof v === 'string' ? v : '';
}

export function isActiveOrderStatus(status: string): boolean {
  return [
    'open',
    'active',
    'matched',
    'full',
    'locked',
    'ready_to_pay',
  ].includes(status);
}

export function formatFirestoreTime(v: unknown): string {
  if (v && typeof v === 'object' && v !== null && 'toMillis' in v) {
    const fn = (v as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') {
      const ms = fn.call(v);
      return ms ? new Date(ms).toLocaleString() : '—';
    }
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return new Date(v).toLocaleString();
  }
  return '—';
}
