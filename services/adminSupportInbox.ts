import { auth, db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type SupportThread = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  lastMessage: string;
  lastSender: 'user' | 'admin';
  updatedAtMs: number | null;
  createdAtMs: number | null;
  unreadAdmin: number;
  unreadUser: number;
  archived: boolean;
  orderId: string | null;
};

export type SupportMessage = {
  id: string;
  sender: 'user' | 'admin';
  senderUid: string;
  body: string;
  createdAtMs: number | null;
  readByAdmin: boolean;
  readByUser: boolean;
};

const THREADS = 'adminSupportThreads';

function mapThread(id: string, data: Record<string, unknown>): SupportThread {
  return {
    id,
    userId: typeof data.userId === 'string' ? data.userId : '',
    userName: typeof data.userName === 'string' ? data.userName : 'User',
    userEmail: typeof data.userEmail === 'string' ? data.userEmail : null,
    lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
    lastSender: data.lastSender === 'admin' ? 'admin' : 'user',
    updatedAtMs: safeToMillis(data.updatedAt),
    createdAtMs: safeToMillis(data.createdAt),
    unreadAdmin: typeof data.unreadAdmin === 'number' ? data.unreadAdmin : 0,
    unreadUser: typeof data.unreadUser === 'number' ? data.unreadUser : 0,
    archived: data.archived === true,
    orderId: typeof data.orderId === 'string' ? data.orderId : null,
  };
}

function mapMessage(id: string, data: Record<string, unknown>): SupportMessage {
  return {
    id,
    sender: data.sender === 'admin' ? 'admin' : 'user',
    senderUid: typeof data.senderUid === 'string' ? data.senderUid : '',
    body: typeof data.body === 'string' ? data.body : '',
    createdAtMs: safeToMillis(data.createdAt),
    readByAdmin: data.readByAdmin === true,
    readByUser: data.readByUser === true,
  };
}

export function subscribeAdminSupportThreads(
  onRows: (rows: SupportThread[]) => void,
  opts?: { archived?: boolean },
): Unsubscribe {
  const archived = opts?.archived === true;
  return onSnapshot(
    query(
      collection(db, THREADS),
      where('archived', '==', archived),
      orderBy('updatedAt', 'desc'),
    ),
    (snap) => {
      onRows(
        snap.docs.map((d) =>
          mapThread(d.id, d.data() as Record<string, unknown>),
        ),
      );
    },
    () => onRows([]),
  );
}

export function subscribeSupportMessages(
  threadId: string,
  onRows: (rows: SupportMessage[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, THREADS, threadId, 'messages'),
      orderBy('createdAt', 'asc'),
    ),
    (snap) => {
      onRows(
        snap.docs.map((d) =>
          mapMessage(d.id, d.data() as Record<string, unknown>),
        ),
      );
    },
    () => onRows([]),
  );
}

/** One open thread per user (doc id = uid). */
export async function userSendSupportMessage(input: {
  body: string;
  orderId?: string | null;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required');
  const body = input.body.trim();
  if (!body) throw new Error('Message is required');

  const userSnap = await getDoc(doc(db, 'users', user.uid));
  const data = userSnap.exists()
    ? (userSnap.data() as Record<string, unknown>)
    : {};
  const userName =
    (typeof data.displayName === 'string' && data.displayName) ||
    (typeof data.name === 'string' && data.name) ||
    user.displayName ||
    'User';
  const userEmail =
    (typeof data.email === 'string' && data.email) || user.email || null;

  const threadId = user.uid;
  const threadRef = doc(db, THREADS, threadId);
  const existing = await getDoc(threadRef);

  if (!existing.exists()) {
    await setDoc(threadRef, {
      userId: user.uid,
      userName,
      userEmail,
      lastMessage: body,
      lastSender: 'user',
      unreadAdmin: 1,
      unreadUser: 0,
      archived: false,
      orderId: input.orderId ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(threadRef, {
      userName,
      userEmail,
      lastMessage: body,
      lastSender: 'user',
      unreadAdmin: increment(1),
      archived: false,
      updatedAt: serverTimestamp(),
      ...(input.orderId ? { orderId: input.orderId } : {}),
    });
  }

  await addDoc(collection(db, THREADS, threadId, 'messages'), {
    sender: 'user',
    senderUid: user.uid,
    body,
    createdAt: serverTimestamp(),
    readByAdmin: false,
    readByUser: true,
  });

  return threadId;
}

export async function adminReplySupportMessage(
  threadId: string,
  body: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required');
  const text = body.trim();
  if (!text) throw new Error('Message is required');

  await addDoc(collection(db, THREADS, threadId, 'messages'), {
    sender: 'admin',
    senderUid: user.uid,
    body: text,
    createdAt: serverTimestamp(),
    readByAdmin: true,
    readByUser: false,
  });
  await updateDoc(doc(db, THREADS, threadId), {
    lastMessage: text,
    lastSender: 'admin',
    unreadUser: increment(1),
    unreadAdmin: 0,
    updatedAt: serverTimestamp(),
  });
}

export async function markSupportThreadReadByAdmin(
  threadId: string,
): Promise<void> {
  await updateDoc(doc(db, THREADS, threadId), {
    unreadAdmin: 0,
  });
}

export async function archiveSupportThread(threadId: string): Promise<void> {
  await updateDoc(doc(db, THREADS, threadId), {
    archived: true,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeAdminSupportUnreadCount(
  onCount: (count: number) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, THREADS),
      where('archived', '==', false),
      where('unreadAdmin', '>', 0),
    ),
    (snap) => onCount(snap.size),
    () => onCount(0),
  );
}

export async function listRecentSupportThreadsForUser(
  uid: string,
): Promise<SupportThread[]> {
  const snap = await getDocs(
    query(
      collection(db, THREADS),
      where('userId', '==', uid),
      orderBy('updatedAt', 'desc'),
      limit(5),
    ),
  );
  return snap.docs.map((d) =>
    mapThread(d.id, d.data() as Record<string, unknown>),
  );
}
