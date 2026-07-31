/**
 * Focus bus for restaurant new-order push taps.
 * Keeps a short-lived pending focus so cold-start can highlight after mount.
 */
type FocusListener = (orderId: string) => void;

const listeners = new Set<FocusListener>();
let pending: { orderId: string; expiresAt: number } | null = null;

const PENDING_TTL_MS = 20_000;

export function setRestaurantOrderFocusFromPush(orderId: string): void {
  const id = orderId.trim();
  if (!id) return;
  pending = { orderId: id, expiresAt: Date.now() + PENDING_TTL_MS };
  listeners.forEach((fn) => {
    try {
      fn(id);
    } catch {
      /* ignore */
    }
  });
}

/** Returns and clears a still-valid pending focus id (cold start / late mount). */
export function consumePendingRestaurantOrderFocus(): string | null {
  if (!pending) return null;
  if (Date.now() > pending.expiresAt) {
    pending = null;
    return null;
  }
  const id = pending.orderId;
  pending = null;
  return id;
}

export function subscribeRestaurantOrderFocus(listener: FocusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
