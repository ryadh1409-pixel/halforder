import { isAdminUser } from '@/constants/adminUid';
import { useAuth } from '@/services/AuthContext';
import {
  buildAdminSupportInboundPush,
  subscribeAdminSupportConversations,
  type AdminSupportInboundKind,
  type SupportConversation,
} from '@/services/supportConversations';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import Toast from 'react-native-toast-message';

function inboundKind(row: SupportConversation): AdminSupportInboundKind {
  if (row.complaintId || row.complaintCategory) return 'complaint';
  return 'new_message';
}

function showInAppBanner(
  title: string,
  body: string,
  onPress: () => void,
): void {
  Toast.show({
    type: 'info',
    text1: title,
    text2: body,
    position: 'top',
    visibilityTime: 5000,
    autoHide: true,
    onPress: () => {
      Toast.hide();
      onPress();
    },
  });
}

/** Realtime admin alerts for inbound customer support / complaints. */
export function AdminSupportInboundListener() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();
  const isAdmin = isAdminUser(user, firestoreUserRole);
  const seededRef = useRef(false);
  const seenRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isAdmin || !user?.uid) return;
    return subscribeAdminSupportConversations((rows) => {
      if (!seededRef.current) {
        seededRef.current = true;
        rows.forEach((r) => {
          seenRef.current[r.id] = r.updatedAtMs ?? 0;
        });
        return;
      }

      for (const row of rows) {
        const prev = seenRef.current[row.id] ?? 0;
        const ts = row.updatedAtMs ?? 0;
        seenRef.current[row.id] = ts;

        if (
          row.unreadAdmin <= 0 ||
          row.lastSender !== 'customer' ||
          ts <= prev
        ) {
          continue;
        }

        const kind = inboundKind(row);
        const { title } = buildAdminSupportInboundPush({
          kind,
          userName: row.userName,
        });
        const ticket =
          row.referenceNumber?.replace(/\D/g, '').slice(-6) ||
          row.id.slice(0, 6).toUpperCase();
        const parts = [
          `Ticket #${ticket}`,
          row.userName || 'Customer',
          row.complaintCategory || null,
          row.orderId ? `Order ${row.orderId.slice(0, 8)}` : null,
          row.priority === 'high' || row.priority === 'urgent'
            ? `${row.priority} priority`
            : null,
          row.attachmentUrls?.length
            ? `${row.attachmentUrls.length} photo${row.attachmentUrls.length === 1 ? '' : 's'}`
            : null,
          row.lastMessage ? row.lastMessage.slice(0, 80) : null,
        ].filter(Boolean);
        const body = parts.join(' · ');
        const href = `/(tabs)/admin/support-inbox/${encodeURIComponent(row.id)}`;

        showInAppBanner(title, body, () => {
          router.push(href as never);
        });
      }
    });
  }, [isAdmin, router, user?.uid]);

  return null;
}
