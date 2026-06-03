/** Normalize Expo Router dynamic segment(s) into a single order id. */
export function normalizeOrderRouteId(
  raw: string | string[] | undefined | null,
): string {
  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'string' ? first.trim() : '';
  }
  return typeof raw === 'string' ? raw.trim() : '';
}
