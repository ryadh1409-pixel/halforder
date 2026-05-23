const activeListeners = new Set<string>();

/** Dev diagnostics — one subscribe/unsubscribe log per listener per session. */
export function logListenerSubscribe(listenerName: string, uid?: string): void {
  if (!__DEV__) return;
  const key = uid ? `${listenerName}:${uid}` : listenerName;
  if (activeListeners.has(key)) return;
  activeListeners.add(key);
  console.log('[LISTENER SUBSCRIBE]', listenerName, uid ?? '');
}

export function logListenerUnsubscribe(listenerName: string, uid?: string): void {
  if (!__DEV__) return;
  const key = uid ? `${listenerName}:${uid}` : listenerName;
  if (!activeListeners.has(key)) return;
  activeListeners.delete(key);
  console.log('[LISTENER UNSUBSCRIBE]', listenerName, uid ?? '');
}

export function resetDriverListenerLogs(): void {
  activeListeners.clear();
}
