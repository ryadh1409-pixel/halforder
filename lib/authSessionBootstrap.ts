/**
 * Idempotent per-uid session side effects (push token, migrate role, etc.).
 * Prevents duplicate work when Firebase emits multiple auth callbacks in dev.
 */

let bootstrappedUid: string | null = null;
let bootstrapInflightUid: string | null = null;

export function resetAuthSessionBootstrap(): void {
  bootstrappedUid = null;
  bootstrapInflightUid = null;
}

/** True when this uid has not yet completed session bootstrap in this JS runtime. */
export function shouldRunAuthSessionBootstrap(uid: string): boolean {
  return bootstrappedUid !== uid && bootstrapInflightUid !== uid;
}

export function markAuthSessionBootstrapStarted(uid: string): void {
  bootstrapInflightUid = uid;
}

export function markAuthSessionBootstrapComplete(uid: string): void {
  bootstrappedUid = uid;
  if (bootstrapInflightUid === uid) {
    bootstrapInflightUid = null;
  }
}

export function markAuthSessionBootstrapFailed(uid: string): void {
  if (bootstrapInflightUid === uid) {
    bootstrapInflightUid = null;
  }
}
