import { goBackFromProfileScreen } from '@/lib/profileBack';
import { resolveFoodShareNotificationRoute } from '@/lib/foodShareNotificationRoutes';
import {
  markSupportReadByCustomer,
  subscribeCustomerSupportConversation,
  type SupportConversation,
} from '@/services/supportConversations';
import { auth } from '@/services/firebase';
import {
  markAllInboxNotificationsRead,
  markInboxNotificationRead,
  subscribeInboxNotifications,
  type InboxNotification,
} from '@/services/foodShareInbox';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type InboxRow =
  | { kind: 'support'; id: string; conversation: SupportConversation }
  | { kind: 'notification'; id: string; notification: InboxNotification };

function formatTimestamp(ms: number | null): string {
  if (ms == null) return 'Just now';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function iconForType(type: string): keyof typeof Ionicons.glyphMap {
  if (type.startsWith('admin_')) {
    if (type === 'admin_promotion') return 'pricetag';
    if (type === 'admin_maintenance') return 'construct';
    if (type === 'admin_alert') return 'warning';
    if (type === 'admin_feature') return 'rocket';
    if (type === 'admin_account') return 'person-circle';
    if (type === 'admin_announcement') return 'megaphone';
    return 'mail';
  }
  if (type.includes('payment')) return 'card';
  if (type.includes('order') || type.includes('deliver')) return 'restaurant';
  return 'notifications';
}

function InboxRowView({
  item,
  onPress,
}: {
  item: InboxRow;
  onPress: () => void;
}) {
  if (item.kind === 'support') {
    const c = item.conversation;
    const unread = c.unreadCustomer > 0;
    return (
      <Pressable
        style={[styles.row, unread && styles.rowUnread]}
        onPress={onPress}
      >
        <View style={styles.rowIcon}>
          <Ionicons
            name="headset"
            size={20}
            color={unread ? '#A855F7' : '#B7BDC9'}
          />
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>HalfOrder Support</Text>
          <Text style={styles.rowBodyText} numberOfLines={2}>
            {c.lastMessage || 'Start a conversation'}
          </Text>
          <Text style={styles.rowTime}>{formatTimestamp(c.updatedAtMs)}</Text>
        </View>
        {unread ? <View style={styles.unreadDot} /> : null}
      </Pressable>
    );
  }

  const n = item.notification;
  const filled = iconForType(n.type);
  return (
    <Pressable
      style={[styles.row, !n.read && styles.rowUnread]}
      onPress={onPress}
    >
      <View style={styles.rowIcon}>
        <Ionicons
          name={filled}
          size={20}
          color={n.read ? '#B7BDC9' : '#A855F7'}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{n.title}</Text>
        <Text style={styles.rowBodyText} numberOfLines={2}>
          {n.body}
        </Text>
        <Text style={styles.rowTime}>{formatTimestamp(n.createdAtMs)}</Text>
      </View>
      {!n.read ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? '';
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [support, setSupport] = useState<SupportConversation | null>(null);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return undefined;
    }
    const unsubNotif = subscribeInboxNotifications(uid, (next) => {
      setNotifications(next);
      setLoading(false);
    });
    const unsubSupport = subscribeCustomerSupportConversation(uid, (row) => {
      setSupport(row);
      setLoading(false);
    });
    return () => {
      unsubNotif();
      unsubSupport();
    };
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return undefined;
      void markAllInboxNotificationsRead(uid).catch(() => {});
      void markSupportReadByCustomer(uid).catch(() => {});
      return undefined;
    }, [uid]),
  );

  const rows = useMemo((): InboxRow[] => {
    const list: InboxRow[] = [];
    if (support) {
      list.push({ kind: 'support', id: `support-${support.id}`, conversation: support });
    } else if (uid) {
      list.push({
        kind: 'support',
        id: 'support-new',
        conversation: {
          id: uid,
          userId: uid,
          userName: 'You',
          userEmail: null,
          userPhotoURL: null,
          lastMessage: '',
          lastSender: 'customer',
          status: 'open',
          unreadAdmin: 0,
          unreadCustomer: 0,
          orderId: null,
          paymentId: null,
          complaintCategory: null,
          complaintId: null,
          adminTyping: false,
          customerTyping: false,
          createdAtMs: null,
          updatedAtMs: null,
        },
      });
    }
    notifications.forEach((n) => {
      list.push({ kind: 'notification', id: n.id, notification: n });
    });
    return list;
  }, [support, notifications, uid]);

  const openRow = async (item: InboxRow) => {
    if (item.kind === 'support') {
      router.push('/customer-support' as never);
      return;
    }
    const n = item.notification;
    if (uid && !n.read) {
      try {
        await markInboxNotificationRead(uid, n.id);
      } catch {
        /* navigate anyway */
      }
    }
    if (
      n.deepLink === '/customer-support' ||
      n.type === 'admin_message' &&
        n.body.toLowerCase().includes('support')
    ) {
      router.push('/customer-support' as never);
      return;
    }
    const href = resolveFoodShareNotificationRoute({
      type: n.type,
      deepLink: n.deepLink,
      matchId: n.matchId,
      adminFoodShareId: n.adminFoodShareId,
    });
    if (href === '/inbox' || String(n.type).startsWith('admin_')) {
      return;
    }
    router.push(href as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={() => goBackFromProfileScreen(router)}
        >
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.title}>Inbox</Text>
        <Pressable
          style={styles.settings}
          onPress={() => router.push('/customer-support' as never)}
          accessibilityLabel="Customer Support"
        >
          <Ionicons name="headset-outline" size={20} color="#FFF" />
        </Pressable>
      </View>

      <Pressable
        style={styles.supportBanner}
        onPress={() => router.push('/customer-support' as never)}
      >
        <Ionicons name="headset-outline" size={18} color="#A855F7" />
        <Text style={styles.supportBannerText}>Message HalfOrder Support</Text>
      </Pressable>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#A855F7" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="mail-open-outline" size={40} color="#7D8493" />
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyBody}>
            Support messages, announcements, and order updates appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <InboxRowView item={item} onPress={() => void openRow(item)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  title: { color: '#FFF', fontSize: 20, fontWeight: '900', flex: 1 },
  settings: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  supportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.28)',
  },
  supportBannerText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyTitle: { color: '#FFF', fontWeight: '800', fontSize: 18 },
  emptyBody: {
    color: '#B7BDC9',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
  list: { padding: 12, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  rowUnread: {
    backgroundColor: 'rgba(168,85,247,0.10)',
    borderColor: 'rgba(168,85,247,0.28)',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  rowBodyText: {
    color: '#B7BDC9',
    marginTop: 4,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  rowTime: {
    color: '#7D8493',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A855F7',
    marginTop: 6,
  },
});
