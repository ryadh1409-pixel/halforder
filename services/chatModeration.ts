import { COMMUNITY_GUIDELINES_MESSAGE } from '@/lib/chatModerationEngine';
import { auth, db, ensureAuthReady, functions } from '@/services/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';

export { COMMUNITY_GUIDELINES_MESSAGE };

const GUIDELINES_VERSION = '2026-04';

function parseFirebaseError(error: unknown): {
  code: string;
  message: string;
  details: unknown;
} {
  const err = error as { code?: string; message?: string; details?: unknown };
  return {
    code: typeof err?.code === 'string' ? err.code : 'unknown',
    message: typeof err?.message === 'string' ? err.message : String(error),
    details: err?.details ?? null,
  };
}

async function writeGuidelinesAcceptanceClient(uid: string): Promise<void> {
  const path = `users/${uid}`;
  const payload = {
    chatSafety: {
      guidelinesAcceptedAt: serverTimestamp(),
      guidelinesVersion: GUIDELINES_VERSION,
    },
  };
  console.log('[GUIDELINES WRITE] before', {
    path,
    payload: { chatSafety: { guidelinesVersion: GUIDELINES_VERSION } },
    uid,
    via: 'client_firestore',
  });
  try {
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
    console.log('[GUIDELINES WRITE] success', { path, uid, via: 'client_firestore' });
  } catch (error) {
    const parsed = parseFirebaseError(error);
    console.error('[GUIDELINES WRITE] failure', {
      path,
      uid,
      via: 'client_firestore',
      code: parsed.code,
      message: parsed.message,
      details: parsed.details,
      error,
    });
    throw error;
  }
}

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
  await ensureAuthReady();
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');

  const callablePayload = {};
  console.log('[GUIDELINES ACCEPT] before callable', {
    callable: 'acceptCommunityGuidelines',
    uid,
    payload: callablePayload,
  });

  try {
    const fn = httpsCallable(functions, 'acceptCommunityGuidelines');
    const result = await fn(callablePayload);
    console.log('[GUIDELINES ACCEPT] callable success', {
      callable: 'acceptCommunityGuidelines',
      uid,
      data: result.data,
    });
    return;
  } catch (callableError) {
    const parsed = parseFirebaseError(callableError);
    console.error('[GUIDELINES ACCEPT] callable failure', {
      callable: 'acceptCommunityGuidelines',
      uid,
      code: parsed.code,
      message: parsed.message,
      details: parsed.details,
      error: callableError,
    });

    const callableMissing =
      parsed.code === 'functions/not-found' ||
      /not-found/i.test(parsed.message);

    if (!callableMissing) {
      throw callableError;
    }

    console.log('[GUIDELINES ACCEPT] callable missing — trying client Firestore write', {
      uid,
    });
    await writeGuidelinesAcceptanceClient(uid);
  }
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
