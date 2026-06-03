/** Process-wide guard — survives React Strict Mode remounts. */
const bootstrappedProfileKeys = new Set<string>();

export function profileLocationBootstrapKey(
  collection: string,
  accountId: string,
): string {
  return `${collection}:${accountId.trim()}`;
}

/** @returns true if this key has not been bootstrapped yet (caller should bootstrap). */
export function claimProfileLocationBootstrap(key: string): boolean {
  if (bootstrappedProfileKeys.has(key)) return false;
  bootstrappedProfileKeys.add(key);
  return true;
}

export function releaseProfileLocationBootstrap(key: string): void {
  bootstrappedProfileKeys.delete(key);
}
