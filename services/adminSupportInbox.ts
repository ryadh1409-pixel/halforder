/**
 * @deprecated Use `supportConversations` — thin re-export for legacy imports.
 */
export {
  type SupportConversation as SupportThread,
  type SupportConversationMessage as SupportMessage,
  subscribeAdminSupportConversations as subscribeAdminSupportThreads,
  subscribeSupportConversationMessages as subscribeSupportMessages,
  sendCustomerSupportMessage as userSendSupportMessage,
  sendAdminSupportReply as adminReplySupportMessage,
  markSupportReadByAdmin as markSupportThreadReadByAdmin,
  closeSupportConversation as archiveSupportThread,
  subscribeAdminSupportUnreadCount,
} from './supportConversations';

import type { SupportConversation } from './supportConversations';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';

export async function listRecentSupportThreadsForUser(
  uid: string,
): Promise<SupportConversation[]> {
  const snap = await getDocs(
    query(
      collection(db, 'supportConversations'),
      where('userId', '==', uid),
      orderBy('updatedAt', 'desc'),
      limit(5),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      userId: typeof data.userId === 'string' ? data.userId : d.id,
      userName: typeof data.userName === 'string' ? data.userName : 'User',
      userEmail: typeof data.userEmail === 'string' ? data.userEmail : null,
      userPhotoURL:
        typeof data.userPhotoURL === 'string' ? data.userPhotoURL : null,
      lastMessage: typeof data.lastMessage === 'string' ? data.lastMessage : '',
      lastSender: data.lastSender === 'admin' ? 'admin' : 'customer',
      status: 'open' as const,
      unreadAdmin: typeof data.unreadAdmin === 'number' ? data.unreadAdmin : 0,
      unreadCustomer:
        typeof data.unreadCustomer === 'number' ? data.unreadCustomer : 0,
      orderId: typeof data.orderId === 'string' ? data.orderId : null,
      paymentId: typeof data.paymentId === 'string' ? data.paymentId : null,
      complaintCategory:
        typeof data.complaintCategory === 'string' ? data.complaintCategory : null,
      complaintId: typeof data.complaintId === 'string' ? data.complaintId : null,
      adminTyping: false,
      customerTyping: false,
      createdAtMs: null,
      updatedAtMs: null,
    };
  });
}
