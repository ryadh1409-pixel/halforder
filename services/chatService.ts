/**
 * Assistant chat: persist user messages to Firestore for product feedback & analytics.
 */
import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from './firebase';

export type FeedbackSentiment = 'positive' | 'negative' | 'neutral';

/**
 * Lightweight sentiment for routing / future dashboards (no ML).
 */
export function inferFeedbackSentiment(text: string): FeedbackSentiment {
  const t = text.trim().toLowerCase();
  if (!t) return 'neutral';
  const neg =
    /\b(hate|hated|bad|awful|terrible|confus|confusing|frustrat|annoying|bug|broken|worst|useless|garbage|trash|sucks)\b/;
  const pos =
    /\b(love|loved|great|awesome|amazing|perfect|thanks|thank you|helpful|good app|nice|excellent|fantastic)\b/;
  if (neg.test(t)) return 'negative';
  if (pos.test(t)) return 'positive';
  return 'neutral';
}

export type SaveChatFeedbackInput = {
  userId: string;
  userName: string;
  message: string;
  email?: string | null;
};

/**
 * Saves every assistant-chat user line to `feedback` (Cloud Function emails support once per doc).
 */
export async function saveAssistantChatFeedback(
  input: SaveChatFeedbackInput,
): Promise<void> {
  const uid = input.userId?.trim();
  const msg = input.message?.trim();
  if (!uid || !msg) {
    console.log('[chatService] skip feedback: missing uid or message');
    return;
  }

  const sentiment = inferFeedbackSentiment(msg);
  try {
    await addDoc(collection(db, 'feedback'), {
      userId: uid,
      userName: input.userName?.trim() || 'User',
      message: msg,
      sentiment,
      source: 'assistant_chat',
      userEmail: input.email?.trim() || null,
      createdAt: serverTimestamp(),
    });
    console.log('[chatService] feedback saved', { uid, sentiment, len: msg.length });
  } catch (e) {
    console.warn('[chatService] saveAssistantChatFeedback failed', e);
  }
}
