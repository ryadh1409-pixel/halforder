/** Dev diagnostics for driver Firestore listener attach/detach. */
export function logListenerSubscribe(listenerName: string): void {
  if (!__DEV__) return;
  console.log('[LISTENER SUBSCRIBE]', listenerName);
}

export function logListenerUnsubscribe(listenerName: string): void {
  if (!__DEV__) return;
  console.log('[LISTENER UNSUBSCRIBE]', listenerName);
}

/** Wraps a teardown function with subscribe/unsubscribe logs. */
export function wrapListenerUnsubscribe(
  listenerName: string,
  teardown: () => void,
): () => void {
  logListenerSubscribe(listenerName);
  return () => {
    logListenerUnsubscribe(listenerName);
    teardown();
  };
}
