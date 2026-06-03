/** Dev-only location/GPS diagnostics — no-op in TestFlight and App Store builds. */

export function logLocationDebug(
  tag: string,
  payload?: Record<string, unknown> | { lat: number; lng: number } | null,
): void {
  if (!__DEV__) return;
  if (payload !== undefined) {
    console.log(tag, payload);
  } else {
    console.log(tag);
  }
}
