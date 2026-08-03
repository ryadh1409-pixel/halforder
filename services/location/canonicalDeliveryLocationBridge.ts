import type { SavedLocation } from '@/types/savedLocation';

type CanonicalDeliveryListener = (location: SavedLocation) => void;

const listeners = new Set<CanonicalDeliveryListener>();

/** Notify UI contexts that the canonical `users/{uid}.location` pin changed. */
export function publishCanonicalDeliveryLocation(location: SavedLocation): void {
  const address = location.address?.trim();
  if (!address) return;
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return;
  }
  for (const listener of listeners) {
    try {
      listener(location);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function subscribeCanonicalDeliveryLocation(
  listener: CanonicalDeliveryListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
