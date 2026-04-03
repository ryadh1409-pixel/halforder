/** Creator / host uid for `orders` documents (schema varies). */
export function orderCreatorUid(data: Record<string, unknown>): string {
  const v =
    data.createdBy ?? data.hostId ?? data.creatorId ?? data.userId ?? '';
  return typeof v === 'string' ? v : '';
}

export function orderFoodLabel(data: Record<string, unknown>): string {
  if (typeof data.foodName === 'string' && data.foodName.trim())
    return data.foodName.trim();
  if (typeof data.title === 'string' && data.title.trim())
    return data.title.trim();
  if (typeof data.restaurantName === 'string' && data.restaurantName.trim())
    return data.restaurantName.trim();
  return '—';
}

const TERMINAL = new Set(['completed', 'cancelled', 'expired']);

export function isActiveOrderStatus(status: string): boolean {
  if (!status) return false;
  if (TERMINAL.has(status)) return false;
  return true;
}
