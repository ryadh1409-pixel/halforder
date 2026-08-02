/** Ephemeral session when returning from `/location` into the address book. */
export type PendingCheckoutAddressEdit =
  | { mode: 'add' }
  | { mode: 'edit'; id: string };

let pending: PendingCheckoutAddressEdit | null = null;

export function setPendingCheckoutAddressEdit(
  next: PendingCheckoutAddressEdit | null,
): void {
  pending = next;
}

export function takePendingCheckoutAddressEdit(): PendingCheckoutAddressEdit | null {
  const current = pending;
  pending = null;
  return current;
}
