import { AdminHeader } from '../../../components/admin/AdminHeader';
import { adminRoutes } from '../../../constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '../../../constants/adminTheme';
import { isAdminUser } from '../../../constants/adminUid';
import { useAuth } from '../../../services/AuthContext';
import { db } from '../../../services/firebase';
import { getReadableErrorMessageOr } from '../../../utils/errorMessages';
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AdminNotificationType =
  | 'new_order_created'
  | 'new_report_submitted'
  | 'payment_failure'
  | 'chargeback_refund_request'
  | 'user_suspended'
  | 'high_risk_moderation'
  | 'flagged_chat_message'
  | string;

type AdminNotificationItem = {
  id: string;
  type: AdminNotificationType;
  title: string;
  message: string;
  createdMs: number;
  orderId: string | null;
  reportId: string | null;
  userId: string | null;
  paymentId: string | null;
  readBy: string[];
};

const FILTERS = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['new_order_created', 'Orders'],
  ['new_report_submitted', 'Reports'],
  ['payment_failure', 'Payments'],
  ['chargeback_refund_request', 'Refunds'],
  ['user_suspended', 'Users'],
  ['high_risk_moderation', 'Moderation'],
  ['flagged_chat_message', 'Flagged chat'],
] as const;

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function timeLabel(ms: number): string {
  if (!ms) return 'Just now';
  return new Date(ms).toLocaleString();
}

function typeLabel(type: string): string {
  switch (type) {
    case 'new_order_created':
      return 'New Order';
    case 'new_report_submitted':
      return 'Report';
    case 'payment_failure':
      return 'Payment Failure';
    case 'chargeback_refund_request':
      return 'Refund / Chargeback';
    case 'user_suspended':
      return 'User Suspended';
    case 'high_risk_moderation':
      return 'High Risk Moderation';
    case 'flagged_chat_message':
      return 'Flagged Chat';
    default:
      return type.replace(/_/g, ' ');
  }
}

export default function AdminNotificationsCenterScreen() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('all');

  const isAdmin = isAdminUser(user, firestoreUserRole);

  useEffect(() => {
    if (!user || !isAdmin) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc')),
      (snap) => {
        const next = snap.docs.map((snapDoc) => {
          const data = snapDoc.data();
          const readBy = Array.isArray(data.readBy)
            ? data.readBy.filter((uid): uid is string => typeof uid === 'string')
            : [];
          return {
            id: snapDoc.id,
            type: typeof data.type === 'string' ? data.type : 'admin_notification',
            title: stringValue(data.title) ?? 'Admin notification',
            message: stringValue(data.message) ?? stringValue(data.body) ?? '',
            createdMs: data.createdAt?.toMillis?.() ?? 0,
            orderId: stringValue(data.orderId),
            reportId: stringValue(data.reportId),
            userId: stringValue(data.userId),
            paymentId: stringValue(data.paymentId),
            readBy,
          };
        });
        setItems(next);
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(getReadableErrorMessageOr(err, 'Failed to load admin notifications'));
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [isAdmin, user]);

  const unreadCount = useMemo(
    () => items.filter((item) => user && !item.readBy.includes(user.uid)).length,
    [items, user],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'unread') {
      return items.filter((item) => user && !item.readBy.includes(user.uid));
    }
    return items.filter((item) => item.type === filter);
  }, [filter, items, user]);

  const markRead = async (item: AdminNotificationItem) => {
    if (!user || item.readBy.includes(user.uid)) return;
    await updateDoc(doc(db, 'admin_notifications', item.id), {
      readBy: arrayUnion(user.uid),
      readAt: serverTimestamp(),
    });
  };

  const openRelated = async (item: AdminNotificationItem) => {
    await markRead(item);
    if (item.reportId) {
      router.push(adminRoutes.report(item.reportId) as never);
      return;
    }
    if (item.orderId) {
      router.push(adminRoutes.order(item.orderId) as never);
      return;
    }
    if (item.paymentId) {
      router.push(adminRoutes.payment(item.paymentId) as never);
      return;
    }
    if (item.userId) {
      router.push(adminRoutes.user(item.userId) as never);
      return;
    }
    if (item.type === 'flagged_chat_message' || item.type === 'high_risk_moderation') {
      router.push(adminRoutes.chatModeration as never);
    }
  };

  if (!user || !isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.unauthorized}>You are not authorized</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <AdminHeader
        title="Admin Notifications"
        subtitle={`${unreadCount} unread · real-time`}
      />
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.chips}>
        {FILTERS.map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, filter === key && styles.chipOn]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>
              {label}
              {key === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No admin notifications match this filter.</Text>
          }
          renderItem={({ item }) => {
            const unread = !item.readBy.includes(user.uid);
            return (
              <TouchableOpacity
                style={[styles.card, unread && styles.unreadCard]}
                activeOpacity={0.88}
                onPress={() => openRelated(item)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.badge}>{typeLabel(item.type)}</Text>
                  {unread ? <Text style={styles.unreadBadge}>Unread</Text> : null}
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.message}</Text>
                <Text style={styles.meta}>{timeLabel(item.createdMs)}</Text>
                <View style={styles.linkRow}>
                  {item.orderId ? <Text style={styles.linkMeta}>Order {item.orderId}</Text> : null}
                  {item.reportId ? <Text style={styles.linkMeta}>Report {item.reportId}</Text> : null}
                  {item.userId ? <Text style={styles.linkMeta}>User {item.userId}</Text> : null}
                </View>
                {unread ? (
                  <TouchableOpacity
                    style={styles.markBtn}
                    onPress={() => markRead(item)}
                  >
                    <Text style={styles.markText}>Mark as read</Text>
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  unauthorized: { fontSize: 18, fontWeight: '700', color: COLORS.error },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 16,
    paddingBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: COLORS.onPrimary },
  list: { padding: 16, paddingTop: 4, paddingBottom: 32 },
  card: { ...adminCardShell, marginBottom: 12 },
  unreadCard: { borderColor: COLORS.primary, borderWidth: 1 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  unreadBadge: {
    backgroundColor: '#dc2626',
    color: '#fff',
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: '800',
  },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  cardBody: { color: COLORS.textMuted, fontSize: 14, marginTop: 6, lineHeight: 20 },
  meta: { color: COLORS.textMuted, fontSize: 12, marginTop: 10 },
  linkRow: { gap: 4, marginTop: 8 },
  linkMeta: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  markBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
  },
  markText: { color: COLORS.primary, fontSize: 13, fontWeight: '800' },
  errorBox: {
    margin: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorText: { color: COLORS.error, fontWeight: '700' },
  empty: {
    textAlign: 'center',
    color: COLORS.textMuted,
    marginTop: 24,
    fontWeight: '600',
  },
});
