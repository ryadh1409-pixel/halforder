/**
 * Converts Firestore timestamps, Dates, ISO strings, unix seconds/ms, or plain
 * `{ seconds, nanoseconds }` shapes to milliseconds. Never throws.
 *
 * Important: `Timestamp.toMillis` must be invoked with the instance as `this`
 * (unbound `const fn = ts.toMillis; fn()` can throw "Cannot read property 'seconds' of undefined").
 */
export function safeToMillis(value: unknown): number | null {
  if (value == null) return null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (value === 0) return 0;
    // Heuristic: Firestore seconds are ~1e9; ms since epoch are ~1e12+
    if (value > 0 && value < 1e12) return Math.round(value * 1000);
    return Math.round(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const ms = Date.parse(trimmed);
    return Number.isNaN(ms) ? null : ms;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  if (typeof value !== 'object') return null;

  const obj = value as Record<string, unknown>;

  const toMillis = obj.toMillis;
  if (typeof toMillis === 'function') {
    try {
      const ms = (toMillis as (this: unknown) => number).call(value);
      return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  }

  const toDate = obj.toDate;
  if (typeof toDate === 'function') {
    try {
      const d = (toDate as (this: unknown) => Date).call(value);
      if (!(d instanceof Date)) return null;
      const ms = d.getTime();
      return Number.isNaN(ms) ? null : ms;
    } catch {
      return null;
    }
  }

  const secRaw = obj.seconds ?? obj._seconds;
  if (typeof secRaw === 'number' && Number.isFinite(secRaw)) {
    const nsRaw = obj.nanoseconds ?? obj._nanoseconds ?? 0;
    const ns = typeof nsRaw === 'number' && Number.isFinite(nsRaw) ? nsRaw : 0;
    return Math.floor(secRaw * 1000 + ns / 1e6);
  }

  return null;
}

/** Logs when a field is present but cannot be parsed (helps catch bad docs in dev). */
export function warnDevIfUnparsableTimestamp(
  docId: string,
  field: string,
  raw: unknown,
): void {
  if (!__DEV__) return;
  if (raw == null) return;
  if (safeToMillis(raw) != null) return;
  // eslint-disable-next-line no-console
  console.warn('[Firestore] Unparsable timestamp field', {
    docId,
    field,
    type: typeof raw,
  });
}
