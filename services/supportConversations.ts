/**
 * Customer ↔ Admin support conversations (Uber-style).
 * Collection: supportConversations/{conversationId}/messages/{messageId}
 * One conversation per customer (conversationId = user uid).
 */
import { ADMIN_UIDS } from '@/constants/adminUid';
import { auth, db } from '@/services/firebase';
import { sendExpoPush } from '@/services/sendExpoPush';
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

export type SupportConversationStatus = 'open' | 'waiting' | 'closed' | 'resolved';

export type SupportConversation = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  userPhotoURL: string | null;
  lastMessage: string;
  lastSender: 'customer' | 'admin';
  status: SupportConversationStatus;
  unreadAdmin: number;
  unreadCustomer: number;
  orderId: string | null;
  paymentId: string | null;
  complaintCategory: string | null;
  complaintId: string | null;
  adminTyping: boolean;
  customerTyping: boolean;
  createdAtMs: number | null;
  updatedAtMs: number | null;
};

export type SupportConversationMessage = {
  id: string;
  sender: 'customer' | 'admin' | 'system';
  senderUid: string;
  body: string;
  kind: 'message' | 'complaint' | 'system';
  createdAtMs: number | null;
  readByAdmin: boolean;
  readByCustomer: boolean;
};

const COL = 'supportConversations';

export const SUPPORT_PUSH = {
  appName: 'HalfOrder',
  customerTitle: 'HalfOrder Support',
  customerBody: 'You have a new reply from our support team.',
  customerDeepLink: '/customer-support',
} as const;

export type AdminSupportInboundKind =
  | 'new_conversation'
  | 'new_message'
  | 'complaint';

export function buildAdminSupportInboundPush(input: {
  kind: AdminSupportInboundKind;
  userName: string;
}): { title: string; body: string } {
  const first =
    input.userName.trim().split(/\s+/).filter(Boolean)[0] ?? 'A customer';
  if (input.kind === 'complaint') {
    return {
      title: 'New Complaint Received',
      body: 'You received a new complaint.',
    };
  }
  if (input.kind === 'new_conversation') {
    return {
      title: 'New Customer Inquiry',
      body: 'A customer needs assistance.',
    };
  }
  return {
    title: 'New Support Message',
    body: `${first} sent a new support message.`,
  };
}

function adminSupportDeepLink(conversationId: string): string {
  return `/(tabs)/admin/support-inbox/${encodeURIComponent(conversationId)}`;
}

function tokenFromUserData(data: Record<string, unknown>): string | null {
  for (const key of ['expoPushToken', 'pushToken', 'fcmToken'] as const) {
    const t = data[key];
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  return null;
}

function mapConversation(
  id: string,
  data: Record<string, unknown>,
): SupportConversation {
  const statusRaw = String(data.status ?? 'open').toLowerCase();
  const status: SupportConversationStatus =
    statusRaw === 'waiting'
      ? 'waiting'
      : statusRaw === 'closed'
        ? 'closed'
        : statusRaw === 'resolved'
          ? 'resolved'
          : 'open';

  return {
    id,
    userId: typeof data.userId === 'string' ? data.userId : id,
    userName: typeof data.userName === 'string' ? data.userName : 'User',
    userEmail: typeof data.userEmail === 'string' ? data.userEmail : null,
    userPhotoURL:
      typeof data.userPhotoURL === 'string' ? data.userPhotoURL : null,
    lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
    lastSender: data.lastSender === 'admin' ? 'admin' : 'customer',
    status,
    unreadAdmin: typeof data.unreadAdmin === 'number' ? data.unreadAdmin : 0,
    unreadCustomer:
      typeof data.unreadCustomer === 'number' ? data.unreadCustomer : 0,
    orderId: typeof data.orderId === 'string' ? data.orderId : null,
    paymentId: typeof data.paymentId === 'string' ? data.paymentId : null,
    complaintCategory:
      typeof data.complaintCategory === 'string' ? data.complaintCategory : null,
    complaintId: typeof data.complaintId === 'string' ? data.complaintId : null,
    adminTyping: data.adminTyping === true,
    customerTyping: data.customerTyping === true,
    createdAtMs: safeToMillis(data.createdAt),
    updatedAtMs: safeToMillis(data.updatedAt),
  };
}

function mapMessage(id: string, data: Record<string, unknown>): SupportConversationMessage {
  const sender =
    data.sender === 'admin'
      ? 'admin'
      : data.sender === 'system'
        ? 'system'
        : 'customer';
  return {
    id,
    sender,
    senderUid: typeof data.senderUid === 'string' ? data.senderUid : '',
    body: typeof data.body === 'string' ? data.body : '',
    kind:
      data.kind === 'complaint'
        ? 'complaint'
        : data.kind === 'system'
          ? 'system'
          : 'message',
    createdAtMs: safeToMillis(data.createdAt),
    readByAdmin: data.readByAdmin === true,
    readByCustomer: data.readByCustomer === true,
  };
}

async function loadUserProfile(uid: string): Promise<{
  userName: string;
  userEmail: string | null;
  userPhotoURL: string | null;
}> {
  const user = auth.currentUser;
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
  const userName =
    (typeof data.displayName === 'string' && data.displayName) ||
    (typeof data.name === 'string' && data.name) ||
    user?.displayName ||
    'User';
  const userEmail =
    (typeof data.email === 'string' && data.email) || user?.email || null;
  const userPhotoURL =
    (typeof data.photoURL === 'string' && data.photoURL) ||
    (typeof data.avatarUrl === 'string' && data.avatarUrl) ||
    null;
  return { userName, userEmail, userPhotoURL };
}

async function collectAdminPushTokens(): Promise<string[]> {
  const tokens = new Set<string>();
  const tryUid = async (uid: string) => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) return;
      const t = tokenFromUserData(snap.data() as Record<string, unknown>);
      if (t) tokens.add(t);
    } catch {
      /* ignore */
    }
  };
  for (const uid of ADMIN_UIDS) {
    await tryUid(uid);
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('role', '==', 'admin'), limit(20)),
    );
    snap.docs.forEach((d) => {
      const t = tokenFromUserData(d.data() as Record<string, unknown>);
      if (t) tokens.add(t);
    });
  } catch {
    /* ignore */
  }
  return Array.from(tokens);
}

async function pushToCustomer(
  customerId: string,
  title: string,
  body: string,
  deepLink: string,
): Promise<void> {
  try {
    const snap = await getDoc(doc(db, 'users', customerId));
    if (!snap.exists()) return;
    const token = tokenFromUserData(snap.data() as Record<string, unknown>);
    if (!token) return;
    await sendExpoPush(
      [token],
      title,
      body,
      { type: 'support_reply', deepLink, conversationId: customerId },
      { priority: 'high', channelId: 'halforder', badge: 1 },
    );
  } catch {
    /* best-effort */
  }
}

async function countAdminUnreadBadge(): Promise<number> {
  try {
    const snap = await getDocs(
      query(collection(db, COL), where('unreadAdmin', '>', 0)),
    );
    return snap.size;
  } catch {
    return 1;
  }
}

async function pushToAdmins(
  conversationId: string,
  kind: AdminSupportInboundKind,
  userName: string,
): Promise<void> {
  try {
    const tokens = await collectAdminPushTokens();
    if (tokens.length === 0) return;
    const { title, body } = buildAdminSupportInboundPush({ kind, userName });
    const badge = await countAdminUnreadBadge();
    await sendExpoPush(
      tokens,
      title,
      body,
      {
        type: 'support_inbound',
        deepLink: adminSupportDeepLink(conversationId),
        conversationId,
        kind,
      },
      { priority: 'high', channelId: 'halforder', badge },
    );
  } catch {
    /* best-effort */
  }
}

export function subscribeSupportConversation(
  conversationId: string,
  onConversation: (row: SupportConversation | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, COL, conversationId),
    (snap) => {
      if (!snap.exists()) {
        onConversation(null);
        return;
      }
      onConversation(
        mapConversation(snap.id, snap.data() as Record<string, unknown>),
      );
    },
    () => onConversation(null),
  );
}

export function subscribeCustomerSupportConversation(
  userId: string,
  onConversation: (row: SupportConversation | null) => void,
): Unsubscribe {
  return subscribeSupportConversation(userId, onConversation);
}

export function subscribeSupportConversationMessages(
  conversationId: string,
  onRows: (rows: SupportConversationMessage[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, COL, conversationId, 'messages'),
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

export function subscribeAdminSupportConversations(
  onRows: (rows: SupportConversation[]) => void,
  opts?: { status?: SupportConversationStatus | 'all' },
): Unsubscribe {
  const status = opts?.status;
  const base =
    status && status !== 'all'
      ? query(
          collection(db, COL),
          where('status', '==', status),
          orderBy('updatedAt', 'desc'),
        )
      : query(collection(db, COL), orderBy('updatedAt', 'desc'));

  return onSnapshot(
    base,
    (snap) => {
      onRows(
        snap.docs.map((d) =>
          mapConversation(d.id, d.data() as Record<string, unknown>),
        ),
      );
    },
    () => onRows([]),
  );
}

export function subscribeAdminSupportUnreadCount(
  onCount: (count: number) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL), where('unreadAdmin', '>', 0)),
    (snap) => onCount(snap.size),
    () => onCount(0),
  );
}

export async function setSupportTyping(
  conversationId: string,
  as: 'customer' | 'admin',
  typing: boolean,
): Promise<void> {
  const patch =
    as === 'admin'
      ? { adminTyping: typing, updatedAt: serverTimestamp() }
      : { customerTyping: typing, updatedAt: serverTimestamp() };
  try {
    await updateDoc(doc(db, COL, conversationId), patch);
  } catch {
    /* conversation may not exist yet */
  }
}

async function appendMessage(
  conversationId: string,
  input: {
    sender: 'customer' | 'admin' | 'system';
    senderUid: string;
    body: string;
    kind?: 'message' | 'complaint' | 'system';
    readByAdmin?: boolean;
    readByCustomer?: boolean;
  },
): Promise<void> {
  await addDoc(collection(db, COL, conversationId, 'messages'), {
    sender: input.sender,
    senderUid: input.senderUid,
    body: input.body,
    kind: input.kind ?? 'message',
    createdAt: serverTimestamp(),
    readByAdmin: input.readByAdmin ?? input.sender === 'admin',
    readByCustomer: input.readByCustomer ?? input.sender === 'customer',
  });
}

export async function sendCustomerSupportMessage(input: {
  body: string;
  orderId?: string | null;
  paymentId?: string | null;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required');
  const body = input.body.trim();
  if (!body) throw new Error('Message is required');

  const conversationId = user.uid;
  const { userName, userEmail, userPhotoURL } = await loadUserProfile(user.uid);
  const ref = doc(db, COL, conversationId);
  const existing = await getDoc(ref);

  if (!existing.exists()) {
    await setDoc(ref, {
      userId: user.uid,
      userName,
      userEmail,
      userPhotoURL,
      lastMessage: body,
      lastSender: 'customer',
      status: 'open',
      unreadAdmin: 1,
      unreadCustomer: 0,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      complaintCategory: null,
      complaintId: null,
      adminTyping: false,
      customerTyping: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, {
      userName,
      userEmail,
      userPhotoURL,
      lastMessage: body,
      lastSender: 'customer',
      status: 'open',
      unreadAdmin: increment(1),
      unreadCustomer: 0,
      customerTyping: false,
      updatedAt: serverTimestamp(),
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.paymentId ? { paymentId: input.paymentId } : {}),
    });
  }

  await appendMessage(conversationId, {
    sender: 'customer',
    senderUid: user.uid,
    body,
    readByAdmin: false,
    readByCustomer: true,
  });

  void pushToAdmins(
    conversationId,
    existing.exists() ? 'new_message' : 'new_conversation',
    userName,
  );

  return conversationId;
}

export async function sendAdminSupportReply(
  conversationId: string,
  body: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required');
  const text = body.trim();
  if (!text) throw new Error('Message is required');

  await appendMessage(conversationId, {
    sender: 'admin',
    senderUid: user.uid,
    body: text,
    readByAdmin: true,
    readByCustomer: false,
  });

  await updateDoc(doc(db, COL, conversationId), {
    lastMessage: text,
    lastSender: 'admin',
    status: 'waiting',
    unreadCustomer: increment(1),
    unreadAdmin: 0,
    adminTyping: false,
    updatedAt: serverTimestamp(),
  });

  void pushToCustomer(
    conversationId,
    SUPPORT_PUSH.customerTitle,
    SUPPORT_PUSH.customerBody,
    SUPPORT_PUSH.customerDeepLink,
  );
}

export async function createComplaintSupportConversation(input: {
  complaintId: string;
  category: string;
  message: string;
  orderId?: string | null;
  paymentId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required');

  const conversationId = user.uid;
  const profile = await loadUserProfile(user.uid);
  const userName = input.userName ?? profile.userName;
  const userEmail = input.userEmail ?? profile.userEmail;
  const now = new Date();
  const dateLabel = now.toLocaleDateString();
  const timeLabel = now.toLocaleTimeString();

  const complaintBody = [
    '📋 New Complaint',
    '',
    `Category: ${input.category}`,
    `Customer: ${userName}`,
    `UID: ${user.uid}`,
    `Email: ${userEmail ?? '—'}`,
    `Order ID: ${input.orderId ?? '—'}`,
    `Payment ID: ${input.paymentId ?? '—'}`,
    `Date: ${dateLabel}`,
    `Time: ${timeLabel}`,
    `Status: Open`,
    '',
    '—',
    input.message.trim(),
  ].join('\n');

  const ref = doc(db, COL, conversationId);
  const existing = await getDoc(ref);

  if (!existing.exists()) {
    await setDoc(ref, {
      userId: user.uid,
      userName,
      userEmail,
      userPhotoURL: profile.userPhotoURL,
      lastMessage: complaintBody.slice(0, 500),
      lastSender: 'customer',
      status: 'open',
      unreadAdmin: 1,
      unreadCustomer: 0,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      complaintCategory: input.category,
      complaintId: input.complaintId,
      adminTyping: false,
      customerTyping: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, {
      userName,
      userEmail,
      lastMessage: complaintBody.slice(0, 500),
      lastSender: 'customer',
      status: 'open',
      unreadAdmin: increment(1),
      unreadCustomer: 0,
      complaintCategory: input.category,
      complaintId: input.complaintId,
      updatedAt: serverTimestamp(),
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.paymentId ? { paymentId: input.paymentId } : {}),
    });
  }

  await appendMessage(conversationId, {
    sender: 'customer',
    senderUid: user.uid,
    body: complaintBody,
    kind: 'complaint',
    readByAdmin: false,
    readByCustomer: true,
  });

  void pushToAdmins(
    conversationId,
    'complaint',
    userName,
  );

  return conversationId;
}

export async function markSupportReadByAdmin(conversationId: string): Promise<void> {
  await updateDoc(doc(db, COL, conversationId), { unreadAdmin: 0 });
}

export async function markSupportReadByCustomer(
  conversationId: string,
): Promise<void> {
  await updateDoc(doc(db, COL, conversationId), { unreadCustomer: 0 });
}

export async function closeSupportConversation(
  conversationId: string,
): Promise<void> {
  await updateDoc(doc(db, COL, conversationId), {
    status: 'closed',
    updatedAt: serverTimestamp(),
  });
}

export async function reopenSupportConversation(
  conversationId: string,
): Promise<void> {
  await updateDoc(doc(db, COL, conversationId), {
    status: 'open',
    updatedAt: serverTimestamp(),
  });
}

export async function resolveSupportConversation(
  conversationId: string,
): Promise<void> {
  await updateDoc(doc(db, COL, conversationId), {
    status: 'resolved',
    updatedAt: serverTimestamp(),
  });
}

/** Admin-initiated message (e.g. from Payment Details contact customer). */
export async function sendAdminSupportMessageToCustomer(input: {
  customerId: string;
  body: string;
  orderId?: string | null;
  paymentId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
}): Promise<void> {
  const admin = auth.currentUser;
  if (!admin) throw new Error('Sign in required');
  const text = input.body.trim();
  if (!text) throw new Error('Message is required');

  const conversationId = input.customerId;
  const ref = doc(db, COL, conversationId);
  const existing = await getDoc(ref);

  if (!existing.exists()) {
    await setDoc(ref, {
      userId: input.customerId,
      userName: input.customerName ?? 'Customer',
      userEmail: input.customerEmail ?? null,
      userPhotoURL: null,
      lastMessage: text.slice(0, 500),
      lastSender: 'admin',
      status: 'waiting',
      unreadAdmin: 0,
      unreadCustomer: 1,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      complaintCategory: null,
      complaintId: null,
      adminTyping: false,
      customerTyping: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, {
      lastMessage: text.slice(0, 500),
      lastSender: 'admin',
      status: 'waiting',
      unreadCustomer: increment(1),
      unreadAdmin: 0,
      updatedAt: serverTimestamp(),
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(input.paymentId ? { paymentId: input.paymentId } : {}),
    });
  }

  await appendMessage(conversationId, {
    sender: 'admin',
    senderUid: admin.uid,
    body: text,
    readByAdmin: true,
    readByCustomer: false,
  });

  void pushToCustomer(
    conversationId,
    SUPPORT_PUSH.customerTitle,
    SUPPORT_PUSH.customerBody,
    SUPPORT_PUSH.customerDeepLink,
  );
}

export function statusLabel(status: SupportConversationStatus): string {
  switch (status) {
    case 'waiting':
      return 'Waiting';
    case 'closed':
      return 'Closed';
    case 'resolved':
      return 'Resolved';
    default:
      return 'Open';
  }
}
