import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EmoAiMessage } from '@/types/emoAi';

const KEY_PREFIX = 'emoAi.messages.v1.';
const STARTED_PREFIX = 'emoAi.started.v1.';

/** Visible chat history window (24 hours). */
export const EMO_AI_VISIBLE_HISTORY_MS = 24 * 60 * 60 * 1000;

function messagesKey(uid: string): string {
  return `${KEY_PREFIX}${uid.trim() || 'guest'}`;
}

function startedKey(uid: string): string {
  return `${STARTED_PREFIX}${uid.trim() || 'guest'}`;
}

export function filterEmoAiMessagesLast24h(
  messages: EmoAiMessage[],
  now = Date.now(),
): EmoAiMessage[] {
  const cutoff = now - EMO_AI_VISIBLE_HISTORY_MS;
  return messages.filter((m) => m.createdAtMs >= cutoff);
}

export async function loadEmoAiMessages(uid: string): Promise<EmoAiMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(messagesKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const all = parsed.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const r = row as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id : '';
      const role = r.role === 'user' || r.role === 'assistant' ? r.role : null;
      const content = typeof r.content === 'string' ? r.content : '';
      const createdAtMs =
        typeof r.createdAtMs === 'number' && Number.isFinite(r.createdAtMs)
          ? r.createdAtMs
          : Date.now();
      if (!id || !role || !content.trim()) return [];
      return [{ id, role, content, createdAtMs } satisfies EmoAiMessage];
    });
    const visible = filterEmoAiMessagesLast24h(all);
    // Persist pruned visible window so expired bubbles disappear permanently from device.
    if (visible.length !== all.length) {
      await saveEmoAiMessages(uid, visible);
    }
    return visible;
  } catch {
    return [];
  }
}

export async function saveEmoAiMessages(
  uid: string,
  messages: EmoAiMessage[],
): Promise<void> {
  try {
    const trimmed = messages.slice(-80);
    await AsyncStorage.setItem(messagesKey(uid), JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export async function loadEmoAiChatStarted(uid: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(startedKey(uid));
    return raw === '1';
  } catch {
    return false;
  }
}

export async function saveEmoAiChatStarted(uid: string): Promise<void> {
  try {
    await AsyncStorage.setItem(startedKey(uid), '1');
  } catch {
    /* ignore */
  }
}
