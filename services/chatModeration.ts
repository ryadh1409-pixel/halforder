import { COMMUNITY_GUIDELINES_MESSAGE } from '@/lib/chatModerationEngine';
import { auth, db, functions } from '@/services/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';

export { COMMUNITY_GUIDELINES_MESSAGE };

export type SendModeratedMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; code: string; message: string; warningLevel?: number };

export async function hasAcceptedCommunityGuidelines(): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'users', uid));
  const safety = (snap.data()?.chatSafety ?? {}) as Record<string, unknown>;
  return safety.guidelinesAcceptedAt != null;
}

export async function acceptCommunityGuidelines(): Promise<void> {
  const fn = httpsCallable(functions, 'acceptCommunityGuidelines');
  await fn({});
}

export async function sendModeratedMatchChatMessage(input: {
  matchChatId: string;
  text: string;
  senderFirstName: string;
}): Promise<SendModeratedMessageResult> {
  const fn = httpsCallable(functions, 'sendModeratedMatchChatMessage');
  try {
    const result = await fn({
      matchChatId: input.matchChatId,
      text: input.text,
      senderFirstName: input.senderFirstName,
    });
    const data = (result.data ?? {}) as { messageId?: string };
    return { ok: true, messageId: data.messageId ?? '' };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; details?: { warningLevel?: number } };
    const msg = err.message ?? COMMUNITY_GUIDELINES_MESSAGE;
    if (msg.includes('COMMUNITY_GUIDELINES_REQUIRED')) {
      return { ok: false, code: 'GUIDELINES_REQUIRED', message: 'Accept community guidelines to chat.' };
    }
    if (msg.includes('CHAT_TEMPORARILY_RESTRICTED')) {
      return {
        ok: false,
        code: 'RESTRICTED',
        message: 'Chat is temporarily restricted due to policy violations.',
      };
    }
    if (msg.includes(COMMUNITY_GUIDELINES_MESSAGE) || err.code === 'functions/failed-precondition') {
      return {
        ok: false,
        code: 'BLOCKED',
        message: COMMUNITY_GUIDELINES_MESSAGE,
        warningLevel:
          typeof err.details === 'object' && err.details?.warningLevel != null
            ? Number(err.details.warningLevel)
            : undefined,
      };
    }
    throw e;
  }
}

export async function muteFoodShareChat(matchChatId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  await setDoc(doc(db, 'users', uid, 'chatMutes', matchChatId), {
    matchChatId,
    mutedAt: serverTimestamp(),
  });
}

export async function unmuteFoodShareChat(matchChatId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(db, 'users', uid, 'chatMutes', matchChatId));
}

export async function hideFoodShareConversation(matchChatId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  await setDoc(doc(db, 'users', uid, 'hiddenChats', matchChatId), {
    matchChatId,
    hiddenAt: serverTimestamp(),
  });
}

export async function isFoodShareChatMuted(matchChatId: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'users', uid, 'chatMutes', matchChatId));
  return snap.exists();
}
