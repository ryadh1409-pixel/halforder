/**
 * Order Support tickets (Uber Eats-style).
 * Collection: supportTickets/{ticketId}/messages/{messageId}
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
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type SupportTicketType = 'food_complaint' | 'delivery_complaint';

export type SupportTicketStatus = 'open' | 'closed';

export type SupportTicketMessageSender = 'user' | 'halforder_team';

/** Optional display persona — never expose admin identity to the customer. */
export type SupportTicketMessagePersona = 'emo' | 'team';

export type SupportTicket = {
  id: string;
  orderId: string;
  userId: string;
  type: SupportTicketType;
  message: string;
  status: SupportTicketStatus;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  /** When true, customer UI shows "HalfOrder Team is typing…" */
  teamTyping: boolean;
};

export type SupportTicketMessage = {
  id: string;
  sender: SupportTicketMessageSender;
  text: string;
  createdAtMs: number | null;
  persona: SupportTicketMessagePersona;
};

const TICKETS = 'supportTickets';
const ADMIN_NOTIFICATIONS = 'adminNotifications';

function tokenFromUserData(data: Record<string, unknown>): string | null {
  for (const key of ['expoPushToken', 'pushToken', 'fcmToken']) {
    const t = data[key];
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  return null;
}

function mapTicket(id: string, data: Record<string, unknown>): SupportTicket {
  const type: SupportTicketType =
    data.type === 'delivery_complaint' ? 'delivery_complaint' : 'food_complaint';
  return {
    id,
    orderId: typeof data.orderId === 'string' ? data.orderId : '',
    userId: typeof data.userId === 'string' ? data.userId : '',
    type,
    message: typeof data.message === 'string' ? data.message : '',
    status: data.status === 'closed' ? 'closed' : 'open',
    createdAtMs: safeToMillis(data.createdAt),
    updatedAtMs: safeToMillis(data.updatedAt) ?? safeToMillis(data.createdAt),
    teamTyping: data.teamTyping === true,
  };
}

function mapMessage(
  id: string,
  data: Record<string, unknown>,
): SupportTicketMessage {
  const sender: SupportTicketMessageSender =
    data.sender === 'halforder_team' ? 'halforder_team' : 'user';
  const persona: SupportTicketMessagePersona =
    data.persona === 'emo' ? 'emo' : 'team';
  return {
    id,
    sender,
    text: typeof data.text === 'string' ? data.text : '',
    createdAtMs: safeToMillis(data.createdAt),
    persona: sender === 'user' ? 'team' : persona,
  };
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

async function notifyAdminsOfSupportTicket(input: {
  ticketId: string;
  orderId: string;
  userId: string;
  type: SupportTicketType;
  message: string;
}): Promise<void> {
  const typeLabel =
    input.type === 'food_complaint' ? 'Food complaint' : 'Delivery complaint';
  const title = 'New support ticket';
  const body = `${typeLabel} on order ${input.orderId}: ${input.message.slice(0, 120)}`;

  try {
    await addDoc(collection(db, ADMIN_NOTIFICATIONS), {
      title,
      message: body,
      body,
      kind: 'support_ticket',
      type: 'support_ticket',
      ticketId: input.ticketId,
      orderId: input.orderId,
      userId: input.userId,
      status: 'unread',
      sentToCount: 0,
      createdAt: serverTimestamp(),
    });
  } catch {
    /* rules / offline — push may still go out */
  }

  try {
    const tokens = await collectAdminPushTokens();
    if (tokens.length === 0) return;
    await sendExpoPush(
      tokens,
      title,
      body,
      {
        type: 'support_ticket',
        ticketId: input.ticketId,
        orderId: input.orderId,
        deepLink: `/(tabs)/admin/support-inbox`,
      },
      { priority: 'high', channelId: 'halforder', badge: 1 },
    );
  } catch {
    /* best-effort */
  }
}

export function subscribeOpenSupportTicketForOrder(
  orderId: string,
  userId: string,
  onTicket: (ticket: SupportTicket | null) => void,
): Unsubscribe {
  if (!orderId.trim() || !userId.trim()) {
    onTicket(null);
    return () => undefined;
  }
  // Single-field query to avoid a composite index; filter order/status client-side.
  const q = query(
    collection(db, TICKETS),
    where('userId', '==', userId),
    limit(25),
  );
  return onSnapshot(
    q,
    (snap) => {
      const match = snap.docs.find((d) => {
        const data = d.data() as Record<string, unknown>;
        return (
          data.orderId === orderId &&
          (data.status === 'open' || data.status == null)
        );
      });
      if (!match) {
        onTicket(null);
        return;
      }
      onTicket(mapTicket(match.id, match.data() as Record<string, unknown>));
    },
    () => onTicket(null),
  );
}

export function subscribeSupportTicket(
  ticketId: string,
  onTicket: (ticket: SupportTicket | null) => void,
): Unsubscribe {
  if (!ticketId.trim()) {
    onTicket(null);
    return () => undefined;
  }
  return onSnapshot(
    doc(db, TICKETS, ticketId),
    (snap) => {
      if (!snap.exists()) {
        onTicket(null);
        return;
      }
      onTicket(mapTicket(snap.id, snap.data() as Record<string, unknown>));
    },
    () => onTicket(null),
  );
}

export function subscribeSupportTicketMessages(
  ticketId: string,
  onRows: (rows: SupportTicketMessage[]) => void,
): Unsubscribe {
  if (!ticketId.trim()) {
    onRows([]);
    return () => undefined;
  }
  return onSnapshot(
    query(
      collection(db, TICKETS, ticketId, 'messages'),
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

export async function createSupportTicket(input: {
  orderId: string;
  type: SupportTicketType;
  message: string;
  /** Transcript written before the ticket existed (greeting → type → prompt → user msg → thanks). */
  transcript: Array<{
    sender: SupportTicketMessageSender;
    text: string;
    persona?: SupportTicketMessagePersona;
  }>;
}): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');

  const trimmed = input.message.trim();
  if (!trimmed) throw new Error('Message required');

  const typeLabel =
    input.type === 'food_complaint' ? 'Food complaint' : 'Delivery complaint';

  const ticketPayload = {
    orderId: input.orderId,
    userId: uid,
    type: input.type,
    message: trimmed,
    status: 'open' as const,
    teamTyping: false,
    messages: input.transcript.map((m) => ({
      sender: m.sender,
      text: m.text,
      persona: m.persona ?? (m.sender === 'halforder_team' ? 'emo' : 'team'),
    })),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  console.log('[supportTickets] createSupportTicket writing', {
    collection: TICKETS,
    orderId: input.orderId,
    userId: uid,
    type: input.type,
    message: trimmed,
  });

  const ticketRef = await addDoc(collection(db, TICKETS), ticketPayload);

  console.log('[supportTickets] createSupportTicket wrote', {
    ticketId: ticketRef.id,
    path: `${TICKETS}/${ticketRef.id}`,
  });

  // Sequential writes so orderBy('createdAt') matches the transcript.
  for (const row of input.transcript) {
    await addDoc(collection(db, TICKETS, ticketRef.id, 'messages'), {
      sender: row.sender,
      text: row.text,
      persona:
        row.persona ??
        (row.sender === 'halforder_team' ? 'emo' : 'team'),
      createdAt: serverTimestamp(),
    });
  }

  void notifyAdminsOfSupportTicket({
    ticketId: ticketRef.id,
    orderId: input.orderId,
    userId: uid,
    type: input.type,
    message: `${typeLabel}: ${trimmed}`,
  });

  return ticketRef.id;
}

export async function sendSupportTicketUserMessage(input: {
  ticketId: string;
  text: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');
  const text = input.text.trim();
  if (!text) return;

  const ticketSnap = await getDoc(doc(db, TICKETS, input.ticketId));
  if (!ticketSnap.exists()) throw new Error('Ticket not found');
  const data = ticketSnap.data() as Record<string, unknown>;
  if (data.userId !== uid) throw new Error('Not your ticket');

  await addDoc(collection(db, TICKETS, input.ticketId, 'messages'), {
    sender: 'user',
    text,
    persona: 'team',
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, TICKETS, input.ticketId), {
    updatedAt: serverTimestamp(),
    message: text,
  });
}

/** Display name never reveals admin identity. */
export function supportMessageDisplayName(
  message: SupportTicketMessage,
): string | null {
  if (message.sender === 'user') return null;
  if (message.persona === 'emo') return 'Emo';
  return 'HalfOrder Team';
}

export function subscribeAdminSupportTickets(
  onRows: (rows: SupportTicket[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, TICKETS), orderBy('createdAt', 'desc')),
    (snap) => {
      onRows(
        snap.docs.map((d) =>
          mapTicket(d.id, d.data() as Record<string, unknown>),
        ),
      );
    },
    (err) => {
      console.warn('[supportTickets] subscribeAdminSupportTickets failed', err);
      onRows([]);
    },
  );
}

export async function sendAdminSupportTicketReply(
  ticketId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!ticketId.trim() || !trimmed) return;

  await addDoc(collection(db, TICKETS, ticketId, 'messages'), {
    sender: 'halforder_team',
    text: trimmed,
    persona: 'team',
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, TICKETS, ticketId), {
    updatedAt: serverTimestamp(),
    message: trimmed,
    teamTyping: false,
    status: 'open',
  });
}

export async function setSupportTicketTeamTyping(
  ticketId: string,
  typing: boolean,
): Promise<void> {
  if (!ticketId.trim()) return;
  await updateDoc(doc(db, TICKETS, ticketId), {
    teamTyping: typing === true,
    updatedAt: serverTimestamp(),
  });
}

export async function closeSupportTicket(ticketId: string): Promise<void> {
  await updateDoc(doc(db, TICKETS, ticketId), {
    status: 'closed',
    teamTyping: false,
    updatedAt: serverTimestamp(),
  });
}

export async function reopenSupportTicket(ticketId: string): Promise<void> {
  await updateDoc(doc(db, TICKETS, ticketId), {
    status: 'open',
    updatedAt: serverTimestamp(),
  });
}

export function supportTicketTypeLabel(type: SupportTicketType): string {
  return type === 'food_complaint' ? 'Food complaint' : 'Delivery complaint';
}

export function supportTicketStatusLabel(status: SupportTicketStatus): string {
  return status === 'closed' ? 'Closed' : 'Open';
}
