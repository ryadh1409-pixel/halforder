import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { createComplaintSupportConversation } from './supportConversations';
import { db } from './firebase';

export type ComplaintUser = {
  uid: string;
  email: string | null;
  displayName?: string | null;
};

export type ComplaintCategory =
  | 'General'
  | 'Order'
  | 'Payment'
  | 'Account'
  | 'Other';

/**
 * Submit a complaint or inquiry. Saves to Firestore `complaints` collection
 * and opens a support conversation for admin inbox.
 */
export async function submitComplaint(
  user: ComplaintUser,
  message: string,
  opts?: {
    category?: ComplaintCategory;
    orderId?: string | null;
    paymentId?: string | null;
  },
): Promise<void> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('Message cannot be empty');
  const category = opts?.category ?? 'General';

  const ref = await addDoc(collection(db, 'complaints'), {
    userId: user.uid,
    userEmail: user.email ?? '',
    userName: user.displayName ?? '',
    message: trimmed,
    category,
    orderId: opts?.orderId ?? null,
    paymentId: opts?.paymentId ?? null,
    createdAt: serverTimestamp(),
    status: 'open',
  });

  await createComplaintSupportConversation({
    complaintId: ref.id,
    category,
    message: trimmed,
    orderId: opts?.orderId ?? null,
    paymentId: opts?.paymentId ?? null,
    userName: user.displayName ?? null,
    userEmail: user.email ?? null,
  });
}
