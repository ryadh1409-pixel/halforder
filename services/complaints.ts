import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import {
  appendSupportSystemMessage,
  createComplaintSupportConversation,
  type SupportMessageAttachment,
} from './supportConversations';
import { db } from './firebase';
import {
  buildEmoSupportConfirmation,
  collectSupportDeviceInfo,
  generateSupportReferenceNumber,
} from './supportIntake';

export type ComplaintUser = {
  uid: string;
  email: string | null;
  displayName?: string | null;
};

/** Legacy categories kept for backward compatibility. */
export type ComplaintCategory =
  | 'General'
  | 'Order'
  | 'Payment'
  | 'Account'
  | 'Other'
  | string;

export type SubmitComplaintResult = {
  complaintId: string;
  conversationId: string;
  referenceNumber: string;
};

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
    paymentAmount?: string | null;
    paymentDate?: string | null;
    attachments?: SupportMessageAttachment[];
    referenceNumber?: string | null;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    skipConfirmationMessage?: boolean;
  },
): Promise<SubmitComplaintResult> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('Message cannot be empty');
  const category = opts?.category ?? 'General';
  const deviceInfo = collectSupportDeviceInfo();
  const referenceNumber =
    opts?.referenceNumber?.trim() || generateSupportReferenceNumber();
  const attachments = opts?.attachments ?? [];

  const ref = await addDoc(collection(db, 'complaints'), {
    userId: user.uid,
    userEmail: user.email ?? '',
    userName: user.displayName ?? '',
    message: trimmed,
    category,
    orderId: opts?.orderId ?? null,
    paymentId: opts?.paymentId ?? null,
    paymentAmount: opts?.paymentAmount ?? null,
    paymentDate: opts?.paymentDate ?? null,
    attachmentUrls: attachments.map((a) => a.url),
    attachments,
    referenceNumber,
    priority: opts?.priority ?? 'normal',
    platform: deviceInfo.platform,
    deviceInfo,
    createdAt: serverTimestamp(),
    status: 'open',
  });

  const conversationId = await createComplaintSupportConversation({
    complaintId: ref.id,
    category,
    message: trimmed,
    orderId: opts?.orderId ?? null,
    paymentId: opts?.paymentId ?? null,
    userName: user.displayName ?? null,
    userEmail: user.email ?? null,
    referenceNumber,
    priority: opts?.priority ?? 'normal',
    attachments,
    deviceInfo: deviceInfo as unknown as Record<string, unknown>,
    platform: deviceInfo.platform,
    paymentAmount: opts?.paymentAmount ?? null,
    paymentDate: opts?.paymentDate ?? null,
  });

  if (!opts?.skipConfirmationMessage) {
    await appendSupportSystemMessage(
      conversationId,
      buildEmoSupportConfirmation(referenceNumber),
    );
  }

  return {
    complaintId: ref.id,
    conversationId,
    referenceNumber,
  };
}
