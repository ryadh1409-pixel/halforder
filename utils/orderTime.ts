import { formatOrderTime, formatRelativeTime, safeTimestampToDate } from '@/utils/time';

export { formatOrderTime, formatRelativeTime, safeTimestampToDate };

/** Label for restaurant order cards (“Placed …”). */
export function formatRestaurantOrderPlacedLabel(
  createdAtMs: number | null,
  timeZone?: string,
): string {
  if (createdAtMs == null) return 'Placed just now';
  return `Placed ${formatOrderTime(createdAtMs, { timeZone })}`;
}
