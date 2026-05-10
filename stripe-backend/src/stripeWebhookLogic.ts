/**
 * Pure helpers for Stripe webhook handling — safe to unit test without Firebase.
 */

export function trimMetadata(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

export function paymentIntentIdFromSession(session: {
  payment_intent?: unknown;
}): string | null {
  const piRaw = session.payment_intent;
  if (typeof piRaw === "string" && piRaw.trim()) return piRaw.trim();
  if (
    piRaw &&
    typeof piRaw === "object" &&
    "id" in piRaw &&
    typeof (piRaw as { id: unknown }).id === "string"
  ) {
    const id = (piRaw as { id: string }).id.trim();
    return id.length ? id : null;
  }
  return null;
}
