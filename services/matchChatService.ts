import { isUserBlocked } from '@/services/block';
import {
  COMMUNITY_GUIDELINES_MESSAGE,
  sendModeratedMatchChatMessage,
} from '@/services/chatModeration';
import type { MatchChatMessage } from '@/types/foodShare';
import { safeToMillis } from '@/utils/safeToMillis';
import { auth, db } from '@/services/firebase';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';

export { COMMUNITY_GUIDELINES_MESSAGE };

export function subscribeMatchMessages(
  matchChatId: string,
  onData: (messages: MatchChatMessage[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'matchChats', matchChatId, 'matchMessages'),
    orderBy('createdAt', 'asc'),
    limit(200),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows: MatchChatMessage[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          senderId: typeof data.senderId === 'string' ? data.senderId : '',
          senderFirstName:
            typeof data.senderFirstName === 'string'
              ? data.senderFirstName
              : 'User',
          text: typeof data.text === 'string' ? data.text : '',
          createdAtMs: safeToMillis(data.createdAt),
        };
      });
      onData(rows);
    },
    () => onData([]),
  );
}

export type SendMatchMessageResult =
  | { ok: true }
  | { ok: false; message: string; code?: string; warningLevel?: number };

export async function sendMatchChatMessage(
  matchChatId: string,
  text: string,
  senderFirstName: string,
  partnerUid?: string,
): Promise<SendMatchMessageResult> {
  if (partnerUid) {
    const uid = auth.currentUser?.uid;
    if (uid && (await isUserBlocked(uid, partnerUid))) {
      return { ok: false, message: 'You cannot message this user.', code: 'BLOCKED' };
    }
  }

  const result = await sendModeratedMatchChatMessage({
    matchChatId,
    text,
    senderFirstName,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      code: result.code,
      warningLevel: result.warningLevel,
    };
  }
  return { ok: true };
}
