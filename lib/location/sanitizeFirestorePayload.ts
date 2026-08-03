import { logLocationDebug } from '@/lib/location/locationDebugLog';

/**
 * Recursively strip `undefined` from objects/arrays so Firestore setDoc/updateDoc
 * never receive unsupported field values. `null` is preserved (explicit clear).
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as T;
  }
  // Firestore FieldValue / Timestamp / Date / GeoPoint — leave as-is
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child === undefined) continue;
    out[key] = stripUndefinedDeep(child);
  }
  return out as T;
}

function collectUndefinedPaths(value: unknown, path = ''): string[] {
  if (value === undefined) return [path || '(root)'];
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) =>
      collectUndefinedPaths(item, path ? `${path}[${i}]` : `[${i}]`),
    );
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    collectUndefinedPaths(v, path ? `${path}.${k}` : k),
  );
}

/** Log + sanitize a location-related Firestore write payload. */
export function prepareLocationWritePayload<T extends Record<string, unknown>>(
  tag: string,
  documentPath: string,
  data: T,
): T {
  const undefinedPaths = collectUndefinedPaths(data);
  if (undefinedPaths.length > 0) {
    logLocationDebug('[LOCATION WRITE] undefined fields stripped', {
      tag,
      documentPath,
      undefinedPaths,
    });
  }

  const cleaned = stripUndefinedDeep(data);
  try {
    logLocationDebug('[LOCATION WRITE PAYLOAD]', {
      tag,
      documentPath,
      keys: Object.keys(cleaned),
      payload: JSON.parse(JSON.stringify(cleaned)),
    });
  } catch {
    logLocationDebug('[LOCATION WRITE PAYLOAD]', {
      tag,
      documentPath,
      keys: Object.keys(cleaned),
      note: 'payload not JSON-serializable (FieldValue present)',
    });
  }
  return cleaned;
}
