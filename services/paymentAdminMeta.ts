/**
 * Admin-only payment metadata (internal notes + payment-scoped support history).
 * Kept separate from `paymentTransactions` (client write is denied).
 */
import { auth, db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

const META = 'paymentAdminMeta';

export type PaymentInternalNotes = {
  text: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAtMs: number | null;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAtMs: number | null;
};

export type PaymentSupportHistoryMessage = {
  id: string;
  sender: 'admin' | 'customer';
  senderUid: string;
  body: string;
  createdAtMs: number | null;
  read: boolean;
  delivered: boolean;
};

function mapNotes(data: Record<string, unknown> | undefined): PaymentInternalNotes {
  if (!data) {
    return {
      text: '',
      createdBy: null,
      createdByName: null,
      createdAtMs: null,
      updatedBy: null,
      updatedByName: null,
      updatedAtMs: null,
    };
  }
  return {
    text: typeof data.notes === 'string' ? data.notes : '',
    createdBy: typeof data.notesCreatedBy === 'string' ? data.notesCreatedBy : null,
    createdByName:
      typeof data.notesCreatedByName === 'string' ? data.notesCreatedByName : null,
    createdAtMs: safeToMillis(data.notesCreatedAt),
    updatedBy: typeof data.notesUpdatedBy === 'string' ? data.notesUpdatedBy : null,
    updatedByName:
      typeof data.notesUpdatedByName === 'string' ? data.notesUpdatedByName : null,
    updatedAtMs: safeToMillis(data.notesUpdatedAt),
  };
}

export function subscribePaymentInternalNotes(
  paymentId: string,
  onNotes: (notes: PaymentInternalNotes) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, META, paymentId),
    (snap) => {
      onNotes(mapNotes(snap.exists() ? (snap.data() as Record<string, unknown>) : undefined));
    },
    () => onNotes(mapNotes(undefined)),
  );
}

export async function savePaymentInternalNotes(
  paymentId: string,
  text: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required');
  const trimmed = text.trim();
  const ref = doc(db, META, paymentId);
  const existing = await getDoc(ref);
  const name =
    user.displayName?.trim() ||
    user.email?.trim() ||
    user.uid;

  if (!existing.exists()) {
    await setDoc(ref, {
      paymentId,
      notes: trimmed,
      notesCreatedBy: user.uid,
      notesCreatedByName: name,
      notesCreatedAt: serverTimestamp(),
      notesUpdatedBy: user.uid,
      notesUpdatedByName: name,
      notesUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const data = existing.data() as Record<string, unknown>;
  const hadNotes =
    typeof data.notesCreatedBy === 'string' && data.notesCreatedBy.length > 0;

  await updateDoc(ref, {
    notes: trimmed,
    ...(hadNotes
      ? {}
      : {
          notesCreatedBy: user.uid,
          notesCreatedByName: name,
          notesCreatedAt: serverTimestamp(),
        }),
    notesUpdatedBy: user.uid,
    notesUpdatedByName: name,
    notesUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function subscribePaymentSupportHistory(
  paymentId: string,
  onRows: (rows: PaymentSupportHistoryMessage[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, META, paymentId, 'messages'),
      orderBy('createdAt', 'asc'),
    ),
    (snap) => {
      onRows(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            sender: data.sender === 'customer' ? 'customer' : 'admin',
            senderUid: typeof data.senderUid === 'string' ? data.senderUid : '',
            body: typeof data.body === 'string' ? data.body : '',
            createdAtMs: safeToMillis(data.createdAt),
            read: data.read === true,
            delivered: data.delivered !== false,
          };
        }),
      );
    },
    () => onRows([]),
  );
}

export async function appendPaymentSupportHistoryMessage(input: {
  paymentId: string;
  sender: 'admin' | 'customer';
  body: string;
  delivered?: boolean;
  read?: boolean;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required');
  const body = input.body.trim();
  if (!body) throw new Error('Message is required');

  const metaRef = doc(db, META, input.paymentId);
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) {
    await setDoc(metaRef, {
      paymentId: input.paymentId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const ref = await addDoc(collection(db, META, input.paymentId, 'messages'), {
    sender: input.sender,
    senderUid: user.uid,
    body,
    delivered: input.delivered !== false,
    read: input.read === true,
    createdAt: serverTimestamp(),
  });
  await updateDoc(metaRef, { updatedAt: serverTimestamp() });
  return ref.id;
}
