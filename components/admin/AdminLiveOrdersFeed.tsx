/**
 * AdminLiveOrdersFeed — persistent section shown at the top of the admin dashboard.
 * Shows the most recent paid orders in real time (last 24 hours).
 * Tapping any order navigates to the order detail page.
 */
import { adminColors as COLORS } from '@/constants/adminTheme';
import { db } from '@/services/firebase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type LiveOrder = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  totalPrice: number;
  deliveryType: string;
  deliveryAddress: string | null;
  restaurantName: string | null;
  itemCount: number;
  createdAtMs: number;
  status: string;
};

function formatTime(ms: number): string {
  const now = Date.now();
  const diff = now - ms;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function mapDoc(id: string, data: Record<string, unknown>): LiveOrder {
  const createdAt = data.createdAt as Timestamp | null;
  const createdAtMs =
    createdAt instanceof Timestamp
      ? createdAt.toMillis()
      : typeof (data.createdAtMs) === 'number'
        ? (data.createdAtMs as number)
        : Date.now();

  const items = Array.isArray(data.items) ? data.items : [];
  const deliveryLocation = data.deliveryLocation as Record<string, unknown> | null;

  return {
    id,
    customerName:
      (data.customerName as string) ||
      (data.customer as Record<string, unknown>)?.name as string ||
      null,
    customerPhone: (data.customerPhone as string) || null,
    totalPrice: typeof data.totalPrice === 'number' ? data.totalPrice : 0,
    deliveryType: (data.deliveryType as string) || 'delivery',
    deliveryAddress:
      (deliveryLocation?.address as string) ||
      (data.deliveryAddress as string) ||
      null,
    restaurantName:
      (data.restaurantName as string) ||
      (data.restaurant as Record<string, unknown>)?.name as string ||
      null,
    itemCount: items.length,
    createdAtMs,
    status: (data.status as string) || '',
  };
}

export function AdminLiveOrdersFeed() {
  const router = useRouter();
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'orders'),
      where('paymentStatus', '==', 'paid'),
      where('createdAt', '>=', Timestamp.fromDate(since)),
      orderBy('createdAt', 'desc'),
      limit(10),
    );

    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        const mapped = snap.docs.map((doc) =>
          mapDoc(doc.id, doc.data() as Record<string, unknown>),
        );
        setOrders(mapped);
        setLoading(false);
      },
      (err) => {
        // Index still building — show empty gracefully
        console.warn('[AdminLiveOrdersFeed]', err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading live orders…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.redDot} />
          <Text style={styles.headerTitle}>Live Paid Orders</Text>
          {orders.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{orders.length}</Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={() => router.push('/(tabs)/admin/orders' as never)}
          style={styles.viewAllBtn}
        >
          <Text style={styles.viewAllText}>View all</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
        </Pressable>
      </View>

      {/* Empty state */}
      {orders.length === 0 ? (
        <View style={styles.emptyRow}>
          <Ionicons name="time-outline" size={20} color="#4B5563" />
          <Text style={styles.emptyText}>No paid orders in the last 24 hours</Text>
        </View>
      ) : (
        orders.map((order) => (
          <Pressable
            key={order.id}
            style={styles.orderRow}
            onPress={() =>
              router.push(`/(tabs)/admin/order/${order.id}` as never)
            }
          >
            {/* Left */}
            <View style={styles.orderLeft}>
              <Text style={styles.orderId}>
                #{order.id.slice(-6).toUpperCase()}
              </Text>
              <Text style={styles.orderCustomer} numberOfLines={1}>
                {order.customerName ?? 'Customer'}
              </Text>
              {order.restaurantName ? (
                <Text style={styles.orderRestaurant} numberOfLines={1}>
                  {order.restaurantName}
                </Text>
              ) : null}
              {order.deliveryAddress ? (
                <Text style={styles.orderAddress} numberOfLines={1}>
                  📍 {order.deliveryAddress}
                </Text>
              ) : null}
            </View>

            {/* Right */}
            <View style={styles.orderRight}>
              <Text style={styles.orderTotal}>
                ${order.totalPrice.toFixed(2)}
              </Text>
              <Text style={styles.orderTime}>{formatTime(order.createdAtMs)}</Text>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      order.status === 'completed'
                        ? '#16a34a'
                        : order.status === 'preparing'
                          ? '#F59E0B'
                          : '#EF4444',
                  },
                ]}
              />
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0D0D1A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EF444430',
    marginBottom: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EF444420',
    backgroundColor: '#110010',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  redDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.4,
  },
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  loadingText: { color: '#7D8493', fontSize: 13 },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
  },
  emptyText: { color: '#4B5563', fontSize: 13, fontWeight: '600' },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1F1F2E',
  },
  orderLeft: { flex: 1, gap: 2 },
  orderId: { fontSize: 13, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  orderCustomer: { fontSize: 13, fontWeight: '600', color: '#CBD5E1' },
  orderRestaurant: { fontSize: 12, fontWeight: '600', color: '#7C3AED' },
  orderAddress: { fontSize: 11, color: '#4B5563', marginTop: 1 },
  orderRight: { alignItems: 'flex-end', gap: 4 },
  orderTotal: { fontSize: 16, fontWeight: '900', color: '#22C55E' },
  orderTime: { fontSize: 11, color: '#7D8493', fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
});
