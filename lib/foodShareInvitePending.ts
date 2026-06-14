let pendingInviteId: string | null = null;

export function setPendingFoodShareInviteId(inviteId: string | null): void {
  pendingInviteId = inviteId?.trim() || null;
}

export function peekPendingFoodShareInviteId(): string | null {
  return pendingInviteId;
}

export function consumePendingFoodShareInviteId(): string | null {
  const id = pendingInviteId;
  pendingInviteId = null;
  return id;
}
