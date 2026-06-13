import { auth, db } from '@/services/firebase';
import type { MatchChatMessage } from '@/types/foodShare';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';

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

export async function sendMatchChatMessage(
  matchChatId: string,
  text: string,
  senderFirstName: string,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  const trimmed = text.trim();
  if (!trimmed) return;
  await addDoc(collection(db, 'matchChats', matchChatId, 'matchMessages'), {
    senderId: uid,
    senderFirstName: senderFirstName.split(/\s+/)[0] ?? senderFirstName,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
}
