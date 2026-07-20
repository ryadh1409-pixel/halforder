import { collection, getDocs, limit, query } from 'firebase/firestore';

import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import type { EmoAiConversationTheme } from '@/types/emoAiAgent';

/**
 * Executive conversation themes — no full chat transcripts.
 * Uses lightweight signals from moderation/events when available.
 */
export async function summarizeConversationThemes(
  startMs: number,
  endMs: number,
): Promise<EmoAiConversationTheme[]> {
  const counts = new Map<string, number>();

  const bump = (theme: string, n = 1) => {
    counts.set(theme, (counts.get(theme) ?? 0) + n);
  };

  try {
    const eventsSnap = await getDocs(query(collection(db, 'events'), limit(2000)));
    for (const d of eventsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const ms = safeToMillis(data.createdAt ?? data.timestamp);
      if (ms == null || ms < startMs || ms > endMs) continue;
      const name = String(data.name ?? data.type ?? '').toLowerCase();
      if (name.includes('pizza') || name.includes('search_pizza')) bump('Users asked about pizza');
      if (name.includes('cheap') || name.includes('deal')) bump('Searched for cheaper meals');
      if (name.includes('nearby') || name.includes('restaurant')) {
        bump('Searched nearby restaurants');
      }
      if (name.includes('delivery') || name.includes('track')) bump('Asked about delivery');
      if (name.includes('refund')) bump('Requested refunds');
    }
  } catch {
    /* optional */
  }

  try {
    const reportsSnap = await getDocs(query(collection(db, 'reports'), limit(500)));
    for (const d of reportsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const ms = safeToMillis(data.createdAt);
      if (ms == null || ms < startMs || ms > endMs) continue;
      bump('Safety / moderation reports filed');
      const reason = String(data.reason ?? data.category ?? '').toLowerCase();
      if (reason.includes('refund') || reason.includes('payment')) {
        bump('Requested refunds');
      }
    }
  } catch {
    /* optional */
  }

  if (!counts.size) {
    return [
      { theme: 'Users asked about pizza', count: 0 },
      { theme: 'Searched for cheaper meals', count: 0 },
      { theme: 'Searched nearby restaurants', count: 0 },
      { theme: 'Asked about delivery', count: 0 },
      { theme: 'Requested refunds', count: 0 },
    ];
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([theme, count]) => ({ theme, count }));
}
