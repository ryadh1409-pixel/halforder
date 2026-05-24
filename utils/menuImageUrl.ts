/**
 * Append a stable cache-busting query param so Expo Image / RN Image reload after uploads.
 * Uses Firestore `updatedAt` when available; otherwise the URL is returned unchanged.
 */
export function menuImageDisplayUri(
  imageUrl: string | null | undefined,
  updatedAtMs?: number | null,
): string | null {
  const raw = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  if (!raw) return null;
  if (!updatedAtMs || !Number.isFinite(updatedAtMs) || updatedAtMs <= 0) {
    return raw;
  }
  try {
    const parsed = new URL(raw);
    parsed.searchParams.set('v', String(Math.floor(updatedAtMs)));
    return parsed.toString();
  } catch {
    const sep = raw.includes('?') ? '&' : '?';
    return `${raw}${sep}v=${Math.floor(updatedAtMs)}`;
  }
}
