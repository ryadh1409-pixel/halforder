/** Firestore Timestamp-like or number ms to milliseconds. */
export function firestoreTimeToMs(v: unknown): number | null {
  if (v && typeof v === 'object' && v !== null && 'toMillis' in v) {
    const fn = (v as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') {
      const ms = fn.call(v);
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    }
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKeyUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
