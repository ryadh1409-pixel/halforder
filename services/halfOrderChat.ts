/**
 * HalfOrder: `chats/{orderId}` mirrors `orders/{orderId}.users` for match chat.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db } from '@/services/firebase';

function normalizeUserIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * Create or merge `chats/{orderId}` so it includes every uid in `userIds`.
 */
export async function ensureHalfOrderChat(
  orderId: string,
  userIds: string[],
): Promise<void> {
  const t = orderId.trim();
  if (!t || userIds.length === 0) return;
  const unique = [...new Set(userIds)].sort();
  const chatRef = doc(db, 'chats', t);
  const existing = await getDoc(chatRef);
  if (!existing.exists()) {
    await setDoc(chatRef, {
      orderId: t,
      users: unique,
      /** Kept in sync with `users` for Cloud Functions + rules (`participants`). */
      participants: unique,
      createdAt: serverTimestamp(),
      lastMessage: '',
      lastMessageAt: Date.now(),
    });
    return;
  }
  const prevList = normalizeUserIds(existing.data()?.users);
  const merged = [...new Set([...prevList, ...unique])].sort();
  const changed =
    merged.length !== prevList.length ||
    merged.some((u, i) => u !== prevList[i]);
  if (changed) {
    await setDoc(
      chatRef,
      { users: merged, participants: merged, orderId: t },
      { merge: true },
    );
  }
}

export async function postHalfOrderChatSystemMessage(
  orderId: string,
  text: string,
): Promise<void> {
  const t = orderId.trim();
  if (!t) return;
  await addDoc(collection(db, 'chats', t, 'messages'), {
    text,
    senderId: 'system',
    createdAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, 'chats', t),
    {
      lastMessage: text,
      lastMessageAt: Date.now(),
    },
    { merge: true },
  );
}
