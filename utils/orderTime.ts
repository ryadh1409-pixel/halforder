import { formatRelativeTime, safeTimestampToDate } from '@/utils/time';

export { safeTimestampToDate };

export type OrderTimeFormatOptions = {
  timeZone?: string;
  nowMs?: number;
};

function resolveTimeZone(timeZone?: string): string {
  const tz = timeZone?.trim();
  if (tz) return tz;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function safeOrderDate(
  createdAtMs: number | null | undefined,
): Date | null {
  if (createdAtMs == null || !Number.isFinite(createdAtMs)) return null;
  const date = new Date(createdAtMs);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local calendar date — e.g. `May 30, 2026`. Never throws. */
export function formatOrderDate(
  createdAtMs: number | null | undefined,
  options?: OrderTimeFormatOptions,
): string {
  const date = safeOrderDate(createdAtMs);
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: resolveTimeZone(options?.timeZone),
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return '—';
  }
}

/** Local clock time — e.g. `7:05 AM`. Never throws. */
export function formatOrderTime(
  createdAtMs: number | null | undefined,
  options?: OrderTimeFormatOptions,
): string {
  const date = safeOrderDate(createdAtMs);
  if (!date) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: resolveTimeZone(options?.timeZone),
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return '—';
  }
}

/** Relative age — e.g. `5 min ago`. Never throws. */
export function formatRelativeAge(
  createdAtMs: number | null | undefined,
  options?: OrderTimeFormatOptions,
): string {
  if (createdAtMs == null || !Number.isFinite(createdAtMs)) return 'Just now';
  try {
    return formatRelativeTime(createdAtMs, {
      timeZone: options?.timeZone,
      now: options?.nowMs,
    });
  } catch {
    return 'Just now';
  }
}

/** Safe phone display for restaurant order cards. Never throws. */
export function safePhone(
  ...candidates: Array<string | null | undefined>
): string {
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return 'Phone unavailable';
}

/** Combined date + time line for compact displays. */
export function formatRestaurantOrderDateTimeLine(
  createdAtMs: number | null | undefined,
  timeZone?: string,
): string {
  const date = formatOrderDate(createdAtMs, { timeZone });
  const time = formatOrderTime(createdAtMs, { timeZone });
  if (date === '—' || time === '—') return '—';
  return `${date} • ${time}`;
}

/** @deprecated Use {@link formatRelativeAge}. */
export function formatRestaurantOrderAgeLabel(
  createdAtMs: number | null | undefined,
  timeZone?: string,
): string {
  return formatRelativeAge(createdAtMs, { timeZone });
}

/** Label for legacy order cards (“Placed …”). */
export function formatRestaurantOrderPlacedLabel(
  createdAtMs: number | null | undefined,
  timeZone?: string,
): string {
  if (createdAtMs == null) return 'Placed just now';
  const age = formatRelativeAge(createdAtMs, { timeZone });
  return age === 'Just now' ? 'Placed just now' : `Placed ${age}`;
}
