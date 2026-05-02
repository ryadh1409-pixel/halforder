/**
 * Resolve display names for blocked-user ids (best-effort, for settings UI).
 */
import { getPublicUserFields } from '../services/users';
import { useEffect, useState } from 'react';

export function useBlockedUserLabels(userIds: readonly string[]): Record<string, string> {
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (userIds.length === 0) {
      setLabels({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        userIds.map(async (id) => {
          try {
            const p = await getPublicUserFields(id);
            next[id] = p?.name?.trim() || shortId(id);
          } catch {
            next[id] = shortId(id);
          }
        }),
      );
      if (!cancelled) setLabels(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [userIds.join('|')]);

  return labels;
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}
