/**
 * AdminOrderAlarmModal — full-screen red alarm card shown when a new paid order arrives.
 * Displays all order details: customer, phone, total, items, delivery address, date.
 */
import type { AlarmOrder } from '@/services/adminOrderAlarm';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import {
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = {
  orders: AlarmOrder[];
  onDismiss: (orderId: string) => void;
  onDismissAll: () => void;
};

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function OrderCard({
  order,
  onDismiss,
}: {
  order: AlarmOrder;
  onDismiss: () => void;
}) {
  const callCustomer = useCallback(() => {
    if (order.customerPhone) {
      Linking.openURL(`tel:${order.customerPhone}`).catch(() => {});
    }
  }, [order.customerPhone]);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.flagRow}>
          <View style={styles.redDot} />
          <Text style={styles.newOrderLabel}>🔴 NEW ORDER</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={12} style={styles.dismissBtn}>
          <Ionicons name="checkmark-circle" size={28} color="#16a34a" />
        </Pressable>
      </View>

      {/* Order ID */}
      <Text style={styles.orderId}>#{order.orderId.slice(-8).toUpperCase()}</Text>

      {/* Time */}
      <View style={styles.row}>
        <Ionicons name="time-outline" size={16} color="#94A3B8" />
        <Text style={styles.detail}>{formatTime(order.createdAtMs)}</Text>
      </View>

      {/* Customer */}
      <View style={styles.row}>
        <Ionicons name="person-outline" size={16} color="#94A3B8" />
        <Text style={styles.detail}>
          {order.customerName ?? 'Unknown customer'}
        </Text>
      </View>

      {/* Phone */}
      {order.customerPhone ? (
        <Pressable onPress={callCustomer} style={styles.row}>
          <Ionicons name="call-outline" size={16} color="#22C55E" />
          <Text style={[styles.detail, styles.phoneLink]}>
            {order.customerPhone}
          </Text>
        </Pressable>
      ) : null}

      {/* Restaurant */}
      {order.restaurantName ? (
        <View style={styles.row}>
          <Ionicons name="storefront-outline" size={16} color="#94A3B8" />
          <Text style={styles.detail}>{order.restaurantName}</Text>
        </View>
      ) : null}

      {/* Delivery type + address */}
      <View style={styles.row}>
        <Ionicons
          name={order.deliveryType === 'delivery' ? 'bicycle-outline' : 'bag-outline'}
          size={16}
          color="#94A3B8"
        />
        <Text style={styles.detail}>
          {order.deliveryType === 'delivery' ? 'Delivery' : 'Pickup'}
          {order.deliveryAddress ? ` — ${order.deliveryAddress}` : ''}
        </Text>
      </View>

      {/* Items */}
      {order.items.length > 0 ? (
        <View style={styles.itemsSection}>
          <Text style={styles.itemsLabel}>Items ({order.itemCount})</Text>
          {order.items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName}>
                {item.qty}× {item.name}
              </Text>
              <Text style={styles.itemPrice}>
                ${(item.price * item.qty).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Total */}
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>${order.totalPrice.toFixed(2)}</Text>
      </View>
    </View>
  );
}

export function AdminOrderAlarmModal({ orders, onDismiss, onDismissAll }: Props) {
  if (orders.length === 0) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <View style={styles.topLeft}>
              <Ionicons name="alert-circle" size={24} color="#EF4444" />
              <Text style={styles.topTitle}>
                {orders.length === 1
                  ? '1 New Order'
                  : `${orders.length} New Orders`}
              </Text>
            </View>
            <Pressable onPress={onDismissAll} style={styles.dismissAllBtn}>
              <Text style={styles.dismissAllText}>Dismiss all</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onDismiss={() => onDismiss(order.id)}
              />
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EF444440',
    backgroundColor: '#1A0000',
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topTitle: { fontSize: 18, fontWeight: '800', color: '#EF4444' },
  dismissAllBtn: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  dismissAllText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#1E0000',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    padding: 16,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  newOrderLabel: { fontSize: 14, fontWeight: '800', color: '#EF4444' },
  dismissBtn: { padding: 4 },
  orderId: { fontSize: 20, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detail: { fontSize: 14, color: '#E2E8F0', fontWeight: '500', flex: 1 },
  phoneLink: { color: '#22C55E', fontWeight: '700', textDecorationLine: 'underline' },
  itemsSection: {
    backgroundColor: '#2D0000',
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginTop: 4,
  },
  itemsLabel: { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginBottom: 2 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemName: { fontSize: 13, color: '#E2E8F0', fontWeight: '600', flex: 1 },
  itemPrice: { fontSize: 13, color: '#FCD34D', fontWeight: '700' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EF444430',
    marginTop: 4,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#94A3B8' },
  totalValue: { fontSize: 22, fontWeight: '900', color: '#22C55E' },
});
