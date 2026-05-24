import { safeToMillis } from '@/utils/safeToMillis';

export type TimeFormatOptions = {
  /** IANA timezone (e.g. `America/Toronto`). Falls back to device timezone. */
  timeZone?: string;
  /** Reference clock for relative labels (default `Date.now()`). */
  now?: number;
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

/** Converts Firestore Timestamp, Date, ISO string, unix seconds/ms → `Date` or `null`. */
export function safeTimestampToDate(value: unknown): Date | null {
  const ms = safeToMillis(value);
  if (ms == null) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatTimeOfDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatMonthDayTime(date: Date, timeZone: string, includeYear: boolean): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Short relative label for recent times.
 * Examples: `Just now`, `2 min ago`, `3 hr ago`.
 */
export function formatRelativeTime(
  value: unknown,
  options?: TimeFormatOptions,
): string {
  const date = safeTimestampToDate(value);
  if (!date) return 'Just now';

  const now = options?.now ?? Date.now();
  const diff = now - date.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'Just now';

  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'Just now';

  const min = Math.floor(sec / 60);
  if (min < 60) return `${Math.max(1, min)} min ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;

  return formatOrderTime(date, options);
}

/**
 * Merchant-friendly order timestamp.
 * Examples: `2 min ago`, `Yesterday 8:41 PM`, `May 22, 7:14 PM`.
 */
export function formatOrderTime(
  value: unknown,
  options?: TimeFormatOptions,
): string {
  const date = safeTimestampToDate(value);
  if (!date) return 'Just now';

  const now = options?.now ?? Date.now();
  const timeZone = resolveTimeZone(options?.timeZone);
  const diff = now - date.getTime();

  if (Number.isFinite(diff) && diff >= 0 && diff < 60 * 60 * 1000) {
    return formatRelativeTime(date, { ...options, now, timeZone });
  }

  const nowDate = new Date(now);
  const todayKey = calendarDayKey(nowDate, timeZone);
  const orderKey = calendarDayKey(date, timeZone);

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = calendarDayKey(yesterdayDate, timeZone);

  const clock = formatTimeOfDay(date, timeZone);

  if (orderKey === todayKey) {
    return clock;
  }
  if (orderKey === yesterdayKey) {
    return `Yesterday ${clock}`;
  }

  const orderYear = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
  }).format(date);
  const nowYear = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
  }).format(nowDate);

  return formatMonthDayTime(date, timeZone, orderYear !== nowYear);
}
