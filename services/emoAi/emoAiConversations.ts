/**
 * Firestore-backed Emo AI conversations for admin review + report insights.
 * Users write their own thread; only admins can list/read all.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import { auth, db } from '@/services/firebase';
import type { EmoAiMessage } from '@/types/emoAi';

export type EmoAiConversationDoc = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  title: string;
  messages: EmoAiMessage[];
  messageCount: number;
  lastActivityMs: number;
  createdAtMs: number;
  flagged: boolean;
  unread: boolean;
  highPriority: boolean;
  searchText: string;
};

const HIGH_PRIORITY_WORDS = [
  'bug',
  'payment',
  'refund',
  'crash',
  'error',
  'scam',
  'fraud',
  'unsafe',
] as const;

export function conversationIsHighPriority(
  messages: ReadonlyArray<{ content: string }>,
): boolean {
  const blob = messages.map((m) => m.content.toLowerCase()).join(' ');
  return HIGH_PRIORITY_WORDS.some((w) => blob.includes(w));
}

function titleFromMessages(messages: EmoAiMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New conversation';
  const t = firstUser.content.trim().replace(/\s+/g, ' ');
  return t.length > 64 ? `${t.slice(0, 61)}…` : t;
}

function buildSearchText(input: {
  userName: string;
  userEmail: string;
  userId: string;
  title: string;
  messages: EmoAiMessage[];
}): string {
  return [
    input.userName,
    input.userEmail,
    input.userId,
    input.title,
    ...input.messages.map((m) => m.content),
  ]
    .join(' ')
    .toLowerCase();
}

/** Upsert the signed-in user's conversation thread (admin-readable archive). */
export async function syncEmoAiConversationToFirestore(input: {
  uid: string;
  userName?: string | null;
  userEmail?: string | null;
  messages: EmoAiMessage[];
}): Promise<void> {
  const uid = input.uid.trim();
  if (!uid) return;
  if (auth.currentUser?.uid !== uid) return;
  if (input.messages.length === 0) return;

  const trimmed = input.messages.slice(-120);
  const now = Date.now();
  const ref = doc(db, 'emoAiConversations', uid);
  let createdAtMs = now;
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      const prev = existing.data() as Partial<EmoAiConversationDoc>;
      if (typeof prev.createdAtMs === 'number') createdAtMs = prev.createdAtMs;
    }
  } catch {
    /* continue */
  }

  const userName = (input.userName ?? '').trim() || 'User';
  const userEmail = (input.userEmail ?? '').trim();
  const title = titleFromMessages(trimmed);
  const highPriority = conversationIsHighPriority(trimmed);
  const searchText = buildSearchText({
    userName,
    userEmail,
    userId: uid,
    title,
    messages: trimmed,
  });

  await setDoc(
    ref,
    {
      userId: uid,
      userName,
      userEmail,
      title,
      messages: trimmed,
      messageCount: trimmed.length,
      lastActivityMs: trimmed[trimmed.length - 1]?.createdAtMs ?? now,
      createdAtMs,
      flagged: highPriority,
      unread: true,
      highPriority,
      searchText,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

function parseConversation(
  id: string,
  data: Record<string, unknown>,
): EmoAiConversationDoc {
  const messagesRaw = Array.isArray(data.messages) ? data.messages : [];
  const messages: EmoAiMessage[] = [];
  for (const row of messagesRaw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const role = r.role === 'user' || r.role === 'assistant' ? r.role : null;
    const content = typeof r.content === 'string' ? r.content : '';
    const mid = typeof r.id === 'string' ? r.id : `m_${messages.length}`;
    const createdAtMs =
      typeof r.createdAtMs === 'number' && Number.isFinite(r.createdAtMs)
        ? r.createdAtMs
        : 0;
    if (!role || !content.trim()) continue;
    messages.push({ id: mid, role, content, createdAtMs });
  }
  return {
    id,
    userId: typeof data.userId === 'string' ? data.userId : id,
    userName: typeof data.userName === 'string' ? data.userName : 'User',
    userEmail: typeof data.userEmail === 'string' ? data.userEmail : '',
    title: typeof data.title === 'string' ? data.title : 'Conversation',
    messages,
    messageCount:
      typeof data.messageCount === 'number'
        ? data.messageCount
        : messages.length,
    lastActivityMs:
      typeof data.lastActivityMs === 'number' ? data.lastActivityMs : 0,
    createdAtMs: typeof data.createdAtMs === 'number' ? data.createdAtMs : 0,
    flagged: data.flagged === true,
    unread: data.unread === true,
    highPriority: data.highPriority === true,
    searchText: typeof data.searchText === 'string' ? data.searchText : '',
  };
}

/** Admin: live list of all Emo conversations (newest first). */
export function subscribeEmoAiConversations(
  onData: (rows: EmoAiConversationDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, 'emoAiConversations'),
      orderBy('lastActivityMs', 'desc'),
      limit(500),
    ),
    (snap) => {
      onData(
        snap.docs.map((d) =>
          parseConversation(d.id, d.data() as Record<string, unknown>),
        ),
      );
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load conversations'));
      onData([]);
    },
  );
}

export async function listEmoAiConversations(): Promise<EmoAiConversationDoc[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'emoAiConversations'),
        orderBy('lastActivityMs', 'desc'),
        limit(500),
      ),
    );
    return snap.docs.map((d) =>
      parseConversation(d.id, d.data() as Record<string, unknown>),
    );
  } catch {
    const snap = await getDocs(query(collection(db, 'emoAiConversations'), limit(500)));
    return snap.docs
      .map((d) => parseConversation(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  }
}

export type EmoConversationFilter =
  | 'all'
  | 'today'
  | 'last7'
  | 'last30'
  | 'unread'
  | 'flagged';

export function filterEmoAiConversations(
  rows: EmoAiConversationDoc[],
  opts: { search?: string; filter?: EmoConversationFilter },
): EmoAiConversationDoc[] {
  const q = (opts.search ?? '').trim().toLowerCase();
  const filter = opts.filter ?? 'all';
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayMs = startOfDay.getTime();

  return rows.filter((row) => {
    if (filter === 'today' && row.lastActivityMs < dayMs) return false;
    if (filter === 'last7' && row.lastActivityMs < now - 7 * 86_400_000) return false;
    if (filter === 'last30' && row.lastActivityMs < now - 30 * 86_400_000) {
      return false;
    }
    if (filter === 'unread' && !row.unread) return false;
    if (filter === 'flagged' && !(row.flagged || row.highPriority)) return false;
    if (!q) return true;
    return (
      row.searchText.includes(q) ||
      row.userName.toLowerCase().includes(q) ||
      row.userEmail.toLowerCase().includes(q) ||
      row.userId.toLowerCase().includes(q) ||
      row.title.toLowerCase().includes(q)
    );
  });
}
