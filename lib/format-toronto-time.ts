import { safeToMillis } from '@/utils/safeToMillis';

function resolveLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function toDate(value: unknown): Date | null {
  const ms = safeToMillis(value);
  if (ms == null || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTorontoTime(
  timestamp: unknown,
): string {
  const d = toDate(timestamp);
  if (!d) return '—';
  return d.toLocaleString('en-CA', {
    timeZone: resolveLocalTimeZone(),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatTorontoOrderTime(
  timestamp: unknown,
): string {
  const d = toDate(timestamp);
  if (!d) return '—';
  const timeZone = resolveLocalTimeZone();
  const today = new Date();
  const dateStr = d.toLocaleDateString('en-CA', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const todayStr = today.toLocaleDateString('en-CA', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const timeStr = formatTorontoTime(timestamp);
  return dateStr === todayStr ? `Today ${timeStr}` : `${dateStr} ${timeStr}`;
}

/** Format as MMM DD, YYYY in the viewer's local timezone */
export function formatTorontoDate(
  timestamp: unknown,
): string {
  const d = toDate(timestamp);
  if (!d) return '—';
  return d.toLocaleDateString('en-CA', {
    timeZone: resolveLocalTimeZone(),
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format as HH:mm (24h) in the viewer's local timezone */
export function formatTorontoTimeHHMM(
  timestamp: unknown,
): string {
  const d = toDate(timestamp);
  if (!d) return '—';
  return d.toLocaleTimeString('en-CA', {
    timeZone: resolveLocalTimeZone(),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
