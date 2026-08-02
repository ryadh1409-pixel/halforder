import { AdminHeader } from '../../../components/admin/AdminHeader';
import { adminRoutes } from '../../../constants/adminRoutes';
import { adminCardShell, adminColors as COLORS, adminFontFamily } from '../../../constants/adminTheme';
import { isAdminUser } from '../../../constants/adminUid';
import { useAuth } from '../../../services/AuthContext';
import { refreshAppBadgeNow } from '../../../services/appBadgeManager';
import { db } from '../../../services/firebase';
import { getReadableErrorMessageOr } from '../../../utils/errorMessages';
import { Ionicons } from '@expo/vector-icons';
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
  Pressable,
  StyleSheet,
  Text,
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
  restaurantName: string | null;
  customerName: string | null;
  amountLabel: string | null;
  paymentStatus: string | null;
  deliveryType: string | null;
  orderStatus: string | null;
  readBy: string[];
};

const FILTERS = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['new_order_created', 'Orders'],
  ['new_report_submitted', 'Reports'],
  ['payment_failure', 'Payments'],
  ['chargeback_refund_request', 'Refunds'],
  ['user_suspended', 'Accounts'],
  ['high_risk_moderation', 'Moderation'],
  ['flagged_chat_message', 'Flagged chat'],
] as const;

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function moneyFromData(data: Record<string, unknown>): string | null {
  if (typeof data.amountLabel === 'string' && data.amountLabel.trim()) {
    return data.amountLabel.trim();
  }
  if (typeof data.amount === 'number' && Number.isFinite(data.amount)) {
    const n = data.amount;
    return n > 1000 ? `CA$${(n / 100).toFixed(2)}` : `CA$${n.toFixed(2)}`;
  }
  if (typeof data.total === 'number' && Number.isFinite(data.total)) {
    return `CA$${data.total.toFixed(2)}`;
  }
  return null;
}

function timeLabel(ms: number): string {
  if (!ms) return 'Just now';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
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
      return 'Account Suspended';
    case 'high_risk_moderation':
      return 'High Risk Moderation';
    case 'flagged_chat_message':
      return 'Flagged Chat';
    default:
      return type.replace(/_/g, ' ');
  }
}

function typeIcon(type: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'new_order_created':
      return 'receipt-outline';
    case 'new_report_submitted':
      return 'flag-outline';
    case 'payment_failure':
    case 'chargeback_refund_request':
      return 'card-outline';
    case 'user_suspended':
      return 'shield-outline';
    case 'flagged_chat_message':
      return 'chatbubble-ellipses-outline';
    default:
      return 'notifications-outline';
  }
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
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
          const data = snapDoc.data() as Record<string, unknown>;
          const readBy = Array.isArray(data.readBy)
            ? data.readBy.filter((uid): uid is string => typeof uid === 'string')
            : [];
          return {
            id: snapDoc.id,
            type: typeof data.type === 'string' ? data.type : 'admin_notification',
            title: stringValue(data.title) ?? 'Admin notification',
            message: stringValue(data.message) ?? stringValue(data.body) ?? '',
            createdMs:
              data.createdAt &&
              typeof data.createdAt === 'object' &&
              data.createdAt !== null &&
              'toMillis' in data.createdAt &&
              typeof (data.createdAt as { toMillis: () => number }).toMillis === 'function'
                ? (data.createdAt as { toMillis: () => number }).toMillis()
                : 0,
            orderId: stringValue(data.orderId),
            reportId: stringValue(data.reportId),
            userId: stringValue(data.userId) ?? stringValue(data.customerId),
            paymentId: stringValue(data.paymentId),
            restaurantName:
              stringValue(data.restaurantName) ?? stringValue(data.restaurant),
            customerName:
              stringValue(data.customerName) ??
              stringValue(data.userName) ??
              stringValue(data.customer),
            amountLabel: moneyFromData(data),
            paymentStatus: stringValue(data.paymentStatus),
            deliveryType:
              stringValue(data.deliveryType) ??
              stringValue(data.fulfillmentType) ??
              stringValue(data.orderType),
            orderStatus:
              stringValue(data.orderStatus) ??
              stringValue(data.status) ??
              stringValue(data.deliveryStatus),
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
    void refreshAppBadgeNow();
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
        title="Notification Center"
        subtitle={`${unreadCount} unread · live feed`}
      />
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      <View style={styles.chips}>
        {FILTERS.map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.chip, filter === key && styles.chipOn]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>
              {label}
              {key === 'unread' && unreadCount > 0 ? ` · ${unreadCount}` : ''}
            </Text>
          </Pressable>
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
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={36} color={COLORS.textMuted} />
              <Text style={styles.empty}>No notifications match this filter.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const unread = !item.readBy.includes(user.uid);
            return (
              <Pressable
                style={[styles.card, unread && styles.unreadCard]}
                onPress={() => openRelated(item)}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.typeRow}>
                    {unread ? <View style={styles.unreadDot} /> : <View style={styles.unreadDotSpacer} />}
                    <View style={styles.typeIcon}>
                      <Ionicons name={typeIcon(item.type)} size={16} color={COLORS.primary} />
                    </View>
                    <Text style={styles.badge}>{typeLabel(item.type)}</Text>
                  </View>
                  <Text style={styles.time}>{timeLabel(item.createdMs)}</Text>
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.message ? (
                  <Text style={styles.cardBody} numberOfLines={3}>
                    {item.message}
                  </Text>
                ) : null}

                <View style={styles.detailsGrid}>
                  <Detail label="Order" value={item.orderId ? `#${item.orderId.slice(0, 10)}` : null} />
                  <Detail label="Restaurant" value={item.restaurantName} />
                  <Detail label="Customer" value={item.customerName} />
                  <Detail label="Amount" value={item.amountLabel} />
                  <Detail label="Payment" value={item.paymentStatus} />
                  <Detail label="Delivery" value={item.deliveryType} />
                  <Detail label="Status" value={item.orderStatus} />
                </View>

                {unread ? (
                  <Pressable
                    style={styles.markBtn}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      void markRead(item);
                    }}
                  >
                    <Text style={styles.markText}>Mark as read</Text>
                  </Pressable>
                ) : null}
              </Pressable>
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
  unauthorized: {
    fontFamily: adminFontFamily,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.error,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
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
  chipText: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  chipTextOn: { color: COLORS.onPrimary },
  list: { padding: 16, paddingTop: 8, paddingBottom: 40 },
  card: { ...adminCardShell, marginBottom: 12 },
  unreadCard: {
    borderColor: 'rgba(168,85,247,0.45)',
    backgroundColor: 'rgba(168,85,247,0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  unreadDotSpacer: { width: 8, height: 8 },
  typeIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  badge: {
    fontFamily: adminFontFamily,
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  time: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  cardTitle: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cardBody: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 6,
    lineHeight: 20,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  detailCell: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  detailLabel: {
    fontFamily: adminFontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailValue: {
    fontFamily: adminFontFamily,
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  markBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.primarySoft,
  },
  markText: {
    fontFamily: adminFontFamily,
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  errorBox: {
    margin: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  errorText: {
    fontFamily: adminFontFamily,
    color: COLORS.error,
    fontWeight: '700',
  },
  emptyWrap: { alignItems: 'center', marginTop: 48, gap: 12 },
  empty: {
    fontFamily: adminFontFamily,
    textAlign: 'center',
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});
