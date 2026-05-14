import { DriverActionButton } from './DriverActionButton';
import { DriverTimeline } from './DriverTimeline';
import { OrderStatusBadge } from './OrderStatusBadge';
import { formatCurrency } from './driverOrderUtils';
import type { DriverOrder } from '@/services/driverService';
import { platformElevation } from '@/utils/platformElevation';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  order: DriverOrder;
  live: boolean;
  nextActionLabel: string | null;
  actionLoading: boolean;
  onPressAction: () => void;
  onCallCustomer: () => void;
  onNavigate: () => void;
};

export function DeliveryCard({
  order,
  live,
  nextActionLabel,
  actionLoading,
  onPressAction,
  onCallCustomer,
  onNavigate,
}: Props) {
  const customerLabel = order.customerName?.trim() || 'Customer';
  const customerInitial = customerLabel.charAt(0).toUpperCase();

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.orderId}>#{order.id.slice(0, 10)}...</Text>
        {live ? <Text style={styles.live}>● LIVE</Text> : null}
      </View>

      <View style={styles.restaurantRow}>
        {order.restaurantImage ? (
          <Image source={{ uri: order.restaurantImage }} style={styles.restaurantImage} />
        ) : (
          <View style={[styles.restaurantImage, styles.restaurantFallback]}>
            <Text style={styles.restaurantFallbackText}>R</Text>
          </View>
        )}
        <View style={styles.restaurantMeta}>
          <Text style={styles.restaurantName}>{order.restaurantName}</Text>
          <Text style={styles.subMeta}>
            ETA {order.estimatedDeliveryTime} min
            {order.distanceKm != null ? `  •  ${order.distanceKm} km` : ''}
          </Text>
        </View>
      </View>

      <OrderStatusBadge status={order.status} />

      <View style={styles.customerRow}>
        {order.customerAvatar ? (
          <Image source={{ uri: order.customerAvatar }} style={styles.customerAvatar} />
        ) : (
          <View style={[styles.customerAvatar, styles.customerFallback]}>
            <Text style={styles.customerFallbackText}>{customerInitial}</Text>
          </View>
        )}
        <View style={styles.customerMeta}>
          <Text style={styles.customerName}>{customerLabel}</Text>
          <Text style={styles.subMeta}>{order.deliveryAddress || 'Address unavailable'}</Text>
        </View>
      </View>

      <Text style={styles.items}>{order.items.map((item) => `${item.qty}x ${item.name}`).join(', ')}</Text>
      <Text style={styles.money}>Subtotal {formatCurrency(order.subtotal)}</Text>
      <Text style={styles.money}>Delivery fee {formatCurrency(order.deliveryFee)}</Text>
      <Text style={styles.total}>Total {formatCurrency(order.total)}</Text>

      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapTitle}>Live map with route navigation</Text>
        <Pressable onPress={onNavigate}>
          <Text style={styles.mapLink}>Open navigation</Text>
        </Pressable>
      </View>

      <DriverTimeline status={order.status} />

      {order.customerPhone ? (
        <Pressable onPress={onCallCustomer}>
          <Text style={styles.call}>Call customer</Text>
        </Pressable>
      ) : null}

      {nextActionLabel ? (
        <DriverActionButton
          label={nextActionLabel}
          loading={actionLoading}
          onPress={onPressAction}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 14,
    ...platformElevation({
      web: '0px 4px 10px rgba(15, 23, 42, 0.08)',
      ios: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 2 },
    }),
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 12, color: '#64748B', fontWeight: '700' },
  live: { color: '#DC2626', fontWeight: '900', fontSize: 12 },
  restaurantRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  restaurantImage: { width: 50, height: 50, borderRadius: 12, marginRight: 10, backgroundColor: '#E2E8F0' },
  restaurantFallback: { alignItems: 'center', justifyContent: 'center' },
  restaurantFallbackText: { color: '#334155', fontWeight: '800' },
  restaurantMeta: { flex: 1 },
  restaurantName: { color: '#0F172A', fontWeight: '800', fontSize: 17 },
  subMeta: { marginTop: 2, color: '#64748B', fontWeight: '600', fontSize: 13 },
  customerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  customerAvatar: { width: 38, height: 38, borderRadius: 999, marginRight: 10, backgroundColor: '#E2E8F0' },
  customerFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#DBEAFE' },
  customerFallbackText: { color: '#1E3A8A', fontWeight: '800' },
  customerMeta: { flex: 1 },
  customerName: { color: '#0F172A', fontWeight: '800' },
  items: { marginTop: 12, color: '#334155', fontWeight: '600' },
  money: { marginTop: 5, color: '#475569', fontWeight: '600' },
  total: { marginTop: 6, color: '#0F172A', fontWeight: '800', fontSize: 15 },
  mapPlaceholder: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    padding: 12,
    backgroundColor: '#F8FAFC',
  },
  mapTitle: { color: '#475569', fontWeight: '700' },
  mapLink: { marginTop: 6, color: '#2563EB', fontWeight: '800' },
  call: { marginTop: 12, color: '#2563EB', fontWeight: '800' },
});
