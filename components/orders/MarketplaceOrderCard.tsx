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
  /** Same timestamp string as Order Details "Paid At" (paidAt → createdAt). */
  createdAtLabel: string;
  section: OrderListSection;
  /** @deprecated Unused — progress bar removed from list cards. */
  listProgress?: number;
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

  const addressLine =
    row.deliveryAddress || row.restaurant.address
      ? formatAddress(row.deliveryAddress || row.restaurant.address)
      : null;

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
      <View style={styles.headerRow}>
        <View style={styles.imgWrap}>
          {row.restaurant.image ? (
            <Image source={{ uri: row.restaurant.image }} style={styles.img} />
          ) : (
            <View style={styles.imgPlaceholder}>
              <MaterialIcons name="restaurant" size={26} color="#8B929E" />
            </View>
          )}
        </View>

        <View style={styles.headerMain}>
          <View style={styles.titleRow}>
            <Text style={styles.restaurantName} numberOfLines={1}>
              {formatRestaurantName(row.restaurant.name)}
            </Text>
            <MaterialIcons name="chevron-right" size={22} color="#8B929E" />
          </View>

          {addressLine ? (
            <Text style={styles.address} numberOfLines={1}>
              {addressLine}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Text style={styles.metaTime} numberOfLines={1}>
              {row.createdAtLabel}
            </Text>
            <View style={styles.metaDot} />
            <View style={styles.participantBadge}>
              <MaterialIcons name="people" size={12} color="#C4C9D4" />
              <Text style={styles.participantText}>{row.participantCount}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.statusTotalRow}>
        <View style={styles.statusCluster}>
          <Text style={styles.statusMain} numberOfLines={1}>
            {formatOrderStatus(row.status)}
          </Text>
          <View style={[styles.payBadge, payBadgeStyle(row.paymentStatus)]}>
            <Text
              style={[styles.payBadgeText, payBadgeTextStyle(row.paymentStatus)]}
            >
              {payLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.totalVal}>${row.totalPrice.toFixed(2)}</Text>
      </View>

      {row.section === 'active' && formatETA(row.etaMinutes) ? (
        <Text style={styles.eta}>{formatETA(row.etaMinutes)}</Text>
      ) : null}

      {row.driverSummary || row.driver.name ? (
        <Text style={styles.driverLine} numberOfLines={1}>
          {row.driverSummary ?? `Driver: ${row.driver.name}`}
        </Text>
      ) : null}

      {row.itemsPreview.length ? (
        <Text style={styles.preview} numberOfLines={1}>
          {row.itemsPreview.map((i) => `${i.qty}× ${i.name}`).join(' · ')}
        </Text>
      ) : null}

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
      return { backgroundColor: 'rgba(34,197,94,0.14)' };
    case 'processing':
      return { backgroundColor: 'rgba(245,158,11,0.14)' };
    case 'failed':
      return { backgroundColor: 'rgba(239,68,68,0.14)' };
    default:
      return { backgroundColor: 'rgba(139,146,158,0.14)' };
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
      return { color: '#8B929E' };
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#14161E',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    ...platformElevation({
      web: '0px 6px 16px rgba(0,0,0,0.28)',
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  cardDisabled: { opacity: 0.52 },
  cardPressed: { opacity: 0.94 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  imgWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMain: { flex: 1, minWidth: 0, paddingTop: 1 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  restaurantName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  address: {
    marginTop: 4,
    color: '#8B929E',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  metaTime: {
    flexShrink: 1,
    color: '#A8AFBC',
    fontSize: 12,
    fontWeight: '600',
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  participantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  participantText: {
    color: '#C4C9D4',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 14,
    marginBottom: 14,
  },
  statusTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  statusMain: {
    flexShrink: 1,
    color: '#E8EAED',
    fontWeight: '700',
    fontSize: 14,
    textTransform: 'capitalize',
  },
  payBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  payBadgeText: { fontWeight: '700', fontSize: 11 },
  totalVal: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: -0.2,
  },
  eta: {
    marginTop: 8,
    color: '#F59E0B',
    fontWeight: '600',
    fontSize: 13,
  },
  driverLine: {
    marginTop: 6,
    color: '#8B929E',
    fontWeight: '500',
    fontSize: 13,
  },
  preview: {
    marginTop: 8,
    color: '#A8AFBC',
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
  },
  openCue: {
    color: '#34D399',
    fontWeight: '700',
    fontSize: 13,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  reportText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
});
