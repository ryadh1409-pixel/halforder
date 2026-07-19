import { DeliveryProgressBar } from '@/components/order/DeliveryProgressBar';
import type { OrderListSection } from '@/constants/orderStatus';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { platformElevation } from '@/utils/platformElevation';
import React from 'react';
import {
  Image,
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
  onReport,
}: {
  row: MarketplaceOrdersFeedRow;
  disabled?: boolean;
  onPress: () => void;
  onReport?: () => void;
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
              <MaterialIcons name="restaurant" size={28} color="#7D8493" />
            </View>
          )}
        </View>
        <View style={styles.topMain}>
          <Text style={styles.restaurantName} numberOfLines={2}>
            {formatRestaurantName(row.restaurant.name)}
          </Text>
          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <MaterialIcons name="schedule" size={13} color="#3B82F6" />
              <Text style={styles.pillText}>{row.createdAtLabel}</Text>
            </View>
            <View style={styles.pill}>
              <MaterialIcons name="people" size={13} color="#F59E0B" />
              <Text style={styles.pillText}>{row.participantCount}</Text>
            </View>
          </View>
        </View>
        <MaterialIcons name="chevron-right" size={22} color="#7D8493" />
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
          <MaterialIcons name="location-on" size={16} color="#7D8493" />
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

      <View style={styles.footerRow}>
        {onReport ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report order"
            hitSlop={8}
            onPress={(event) => {
              event.stopPropagation();
              onReport();
            }}
            style={styles.reportBtn}
          >
            <MaterialIcons name="flag" size={14} color="#EF4444" />
            <Text style={styles.reportText}>Report</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Text style={styles.openCue}>View details</Text>
      </View>
    </Pressable>
  );
}

function payBadgeStyle(p: string): object {
  switch (p) {
    case 'paid':
      return { backgroundColor: 'rgba(34,197,94,0.16)', borderColor: 'rgba(34,197,94,0.4)' };
    case 'processing':
      return { backgroundColor: 'rgba(245,158,11,0.14)', borderColor: 'rgba(245,158,11,0.35)' };
    case 'failed':
      return { backgroundColor: 'rgba(239,68,68,0.14)', borderColor: 'rgba(239,68,68,0.35)' };
    default:
      return { backgroundColor: 'rgba(125,132,147,0.16)', borderColor: 'rgba(125,132,147,0.28)' };
  }
}

function payBadgeTextStyle(p: string): object {
  switch (p) {
    case 'paid':
      return { color: '#22C55E' };
    case 'processing':
      return { color: '#F59E0B' };
    case 'failed':
      return { color: '#EF4444' };
    default:
      return { color: '#7D8493' };
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    backgroundColor: '#171923',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.22)',
    ...platformElevation({
      web: '0px 10px 18px rgba(168, 85, 247, 0.12)',
      ios: {
        shadowColor: '#A855F7',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
      },
      android: { elevation: 8 },
    }),
  },
  cardDisabled: { opacity: 0.52 },
  cardPressed: { opacity: 0.92 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imgWrap: { width: 56, height: 56, borderRadius: 14, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: {
    flex: 1,
    backgroundColor: 'rgba(23,25,35,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topMain: { flex: 1 },
  restaurantName: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
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
  pillText: { color: '#B7BDC9', fontSize: 12, fontWeight: '700' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 10,
  },
  statusMain: {
    flex: 1,
    color: '#B7BDC9',
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
  eta: { marginTop: 8, color: '#F59E0B', fontWeight: '700', fontSize: 13 },
  driverLine: { marginTop: 6, color: '#7D8493', fontWeight: '600', fontSize: 13 },
  preview: { marginTop: 10, color: '#B7BDC9', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  addr: { flex: 1, color: '#7D8493', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  totalLabel: { color: '#7D8493', fontWeight: '700', fontSize: 13 },
  totalVal: { color: '#FFFFFF', fontWeight: '900', fontSize: 18 },
  progressWrap: { marginTop: 14 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
  openCue: {
    alignSelf: 'flex-end',
    color: 'rgba(34,197,94,0.85)',
    fontWeight: '800',
    fontSize: 13,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  reportText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
});
