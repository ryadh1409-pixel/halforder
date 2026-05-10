import { DeliveryProgressBar } from '@/components/order/DeliveryProgressBar';
import type { OrderListSection } from '@/constants/orderStatus';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  formatAddress,
  formatETA,
  formatOrderStatus,
  formatRestaurantName,
} from '@/utils/orderFormatters';

export type MarketplaceOrdersFeedRow = {
  id: string;
  restaurant: {
    id: string | null;
    name: string;
    image: string | null;
    address: string | null;
  };
  customer: {
    id: string | null;
    name: string;
    avatar: string | null;
    address: string | null;
  };
  driver: {
    id: string | null;
    name: string | null;
    avatar: string | null;
    phone: string | null;
    vehicle: string | null;
    status: string | null;
  };
  status: string;
  paymentStatus: string;
  totalPrice: number;
  etaMinutes: number | null;
  deliveryAddress: string | null;
  driverSummary: string | null;
  itemsPreview: { name: string; qty: number }[];
  participantCount: number;
  createdAtLabel: string;
  section: OrderListSection;
  listProgress: number;
};

export function MarketplaceOrderCard({
  row,
  disabled,
  onPress,
}: {
  row: MarketplaceOrdersFeedRow;
  disabled?: boolean;
  onPress: () => void;
}) {
  const payLabel =
    row.paymentStatus === 'paid'
      ? 'Paid'
      : row.paymentStatus === 'processing'
        ? 'Processing'
        : row.paymentStatus === 'failed'
          ? 'Payment failed'
          : row.paymentStatus === 'refunded'
            ? 'Refunded'
            : 'Unpaid';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Order ${row.restaurant.name}, ${row.status}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        disabled && styles.cardDisabled,
        pressed && !disabled && styles.cardPressed,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.imgWrap}>
          {row.restaurant.image ? (
            <Image source={{ uri: row.restaurant.image }} style={styles.img} />
          ) : (
            <View style={styles.imgPlaceholder}>
              <MaterialIcons name="restaurant" size={28} color="rgba(255,255,255,0.35)" />
            </View>
          )}
        </View>
        <View style={styles.topMain}>
          <Text style={styles.restaurantName} numberOfLines={2}>
            {formatRestaurantName(row.restaurant.name)}
          </Text>
          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <MaterialIcons name="schedule" size={13} color="#93C5FD" />
              <Text style={styles.pillText}>{row.createdAtLabel}</Text>
            </View>
            <View style={styles.pill}>
              <MaterialIcons name="people" size={13} color="#FBBF24" />
              <Text style={styles.pillText}>{row.participantCount}</Text>
            </View>
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={22} color="rgba(255,255,255,0.35)" />
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.statusMain}>{formatOrderStatus(row.status)}</Text>
        <View style={[styles.payBadge, payBadgeStyle(row.paymentStatus)]}>
          <Text style={[styles.payBadgeText, payBadgeTextStyle(row.paymentStatus)]}>{payLabel}</Text>
        </View>
      </View>

      {row.section === 'active' && formatETA(row.etaMinutes) ? (
        <Text style={styles.eta}>{formatETA(row.etaMinutes)}</Text>
      ) : null}

      {row.driverSummary || row.driver.name ? (
        <Text style={styles.driverLine}>
          {row.driverSummary ?? `Driver: ${row.driver.name}`}
        </Text>
      ) : null}

      {row.itemsPreview.length ? (
        <Text style={styles.preview} numberOfLines={2}>
          {row.itemsPreview.map((i) => `${i.qty}× ${i.name}`).join(' · ')}
        </Text>
      ) : null}

      {row.deliveryAddress ? (
        <View style={styles.addrRow}>
          <MaterialIcons name="location-on" size={16} color="#94A3B8" />
          <Text style={styles.addr} numberOfLines={2}>
            {formatAddress(row.deliveryAddress)}
          </Text>
        </View>
      ) : null}

      <View style={styles.priceRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalVal}>${row.totalPrice.toFixed(2)}</Text>
      </View>

      <View style={styles.progressWrap}>
        <DeliveryProgressBar progress={Math.min(1, Math.max(0.06, row.listProgress))} />
      </View>

      <Text style={styles.openCue}>View details</Text>
    </Pressable>
  );
}

function payBadgeStyle(p: string): object {
  switch (p) {
    case 'paid':
      return { backgroundColor: 'rgba(52,211,153,0.18)', borderColor: 'rgba(52,211,153,0.45)' };
    case 'processing':
      return { backgroundColor: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.35)' };
    case 'failed':
      return { backgroundColor: 'rgba(248,113,113,0.14)', borderColor: 'rgba(248,113,113,0.35)' };
    default:
      return { backgroundColor: 'rgba(148,163,184,0.12)', borderColor: 'rgba(148,163,184,0.28)' };
  }
}

function payBadgeTextStyle(p: string): object {
  switch (p) {
    case 'paid':
      return { color: '#BBF7D0' };
    case 'processing':
      return { color: '#FDE68A' };
    case 'failed':
      return { color: '#FECACA' };
    default:
      return { color: '#CBD5E1' };
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    backgroundColor: '#11161F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  cardDisabled: { opacity: 0.52 },
  cardPressed: { opacity: 0.92 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imgWrap: { width: 56, height: 56, borderRadius: 14, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topMain: { flex: 1 },
  restaurantName: { color: '#F8FAFC', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  pillText: { color: 'rgba(248,250,252,0.88)', fontSize: 12, fontWeight: '700' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 10,
  },
  statusMain: {
    flex: 1,
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 15,
    textTransform: 'capitalize',
  },
  payBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  payBadgeText: { fontWeight: '800', fontSize: 11 },
  eta: { marginTop: 8, color: '#FDE68A', fontWeight: '700', fontSize: 13 },
  driverLine: { marginTop: 6, color: 'rgba(148,163,184,0.95)', fontWeight: '600', fontSize: 13 },
  preview: { marginTop: 10, color: 'rgba(226,232,240,0.72)', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  addr: { flex: 1, color: 'rgba(148,163,184,0.95)', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  totalLabel: { color: 'rgba(148,163,184,0.95)', fontWeight: '700', fontSize: 13 },
  totalVal: { color: '#F8FAFC', fontWeight: '900', fontSize: 18 },
  progressWrap: { marginTop: 14 },
  openCue: {
    marginTop: 10,
    alignSelf: 'flex-end',
    color: 'rgba(52,211,153,0.85)',
    fontWeight: '800',
    fontSize: 13,
  },
});
