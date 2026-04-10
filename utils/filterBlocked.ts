/**
 * Central helpers to exclude blocked users from in-memory lists.
 * Pass `hiddenUserIds` from `useHiddenUserIds()` (bidirectional: you blocked them + they blocked you).
 */

export type HiddenUserIdsInput = Set<string> | { hiddenUserIds: Set<string> };

export function resolveHiddenUserIds(input: HiddenUserIdsInput): Set<string> {
  return input instanceof Set ? input : input.hiddenUserIds;
}

/**
 * Drop list entries whose user id is in the hidden set.
 * Items with a missing/empty user id are kept (caller can pre-filter if needed).
 */
export function filterBlockedUsers<T>(
  list: readonly T[],
  currentUserOrHidden: HiddenUserIdsInput,
  getUserId: (item: T) => string | null | undefined,
): T[] {
  const hidden = resolveHiddenUserIds(currentUserOrHidden);
  return list.filter((item) => {
    const id = getUserId(item);
    if (id == null || id === '') return true;
    return !hidden.has(id);
  });
}

export function filterBlockedUserIds(
  userIds: readonly string[],
  hiddenUserIds: Set<string>,
): string[] {
  return userIds.filter((id) => id && !hiddenUserIds.has(id));
}
