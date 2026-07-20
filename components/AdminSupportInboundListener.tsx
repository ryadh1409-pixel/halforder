import { isAdminUser } from '@/constants/adminUid';
import { useAuth } from '@/services/AuthContext';
import {
  buildAdminSupportInboundPush,
  subscribeAdminSupportConversations,
  type AdminSupportInboundKind,
  type SupportConversation,
} from '@/services/supportConversations';
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';

function inboundKind(row: SupportConversation): AdminSupportInboundKind {
  if (row.complaintId || row.complaintCategory) return 'complaint';
  return 'new_message';
}

function syncBadge(rows: SupportConversation[]): void {
  if (Platform.OS === 'web' || isExpoGo) return;
  const count = rows.filter((r) => r.unreadAdmin > 0).length;
  void Notifications.setBadgeCountAsync(count).catch(() => undefined);
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
      syncBadge(rows);

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
        const { title, body } = buildAdminSupportInboundPush({
          kind,
          userName: row.userName,
        });
        const href = `/(tabs)/admin/support-inbox/${encodeURIComponent(row.id)}`;

        showInAppBanner(title, body, () => {
          router.push(href as never);
        });
      }
    });
  }, [isAdmin, router, user?.uid]);

  return null;
}
