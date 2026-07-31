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
            : 'Awaiting Payment';

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
              <MaterialIcons name="restaurant" size={24} color="#8B929E" />
            </View>
          )}
        </View>

        <View style={styles.headerMain}>
          <View style={styles.titleRow}>
            <Text style={styles.restaurantName} numberOfLines={1}>
              {formatRestaurantName(row.restaurant.name)}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color="#6B7280" />
          </View>

          {addressLine ? (
            <Text style={styles.address} numberOfLines={2}>
              {addressLine}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Text style={styles.metaTime} numberOfLines={1}>
              {row.createdAtLabel}
            </Text>
            <View style={styles.metaDot} />
            <View style={styles.participantBadge}>
              <MaterialIcons name="people" size={13} color="#C4C9D4" />
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
              numberOfLines={1}
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
            <MaterialIcons name="flag" size={13} color="#EF4444" />
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
      return { backgroundColor: 'rgba(34,197,94,0.16)' };
    case 'processing':
      return { backgroundColor: 'rgba(245,158,11,0.16)' };
    case 'failed':
      return { backgroundColor: 'rgba(239,68,68,0.16)' };
    default:
      return { backgroundColor: 'rgba(148,163,184,0.16)' };
  }
}

function payBadgeTextStyle(p: string): object {
  switch (p) {
    case 'paid':
      return { color: '#4ADE80' };
    case 'processing':
      return { color: '#FBBF24' };
    case 'failed':
      return { color: '#F87171' };
    default:
      return { color: '#94A3B8' };
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 14,
    backgroundColor: '#12141C',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
    ...platformElevation({
      web: '0px 8px 20px rgba(0,0,0,0.32)',
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
      },
      android: { elevation: 5 },
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
    width: 58,
    height: 58,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
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
    gap: 6,
  },
  restaurantName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  address: {
    marginTop: 5,
    color: '#8B929E',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 10,
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
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  participantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  participantText: {
    color: '#C4C9D4',
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginTop: 16,
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
    flexWrap: 'wrap',
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  payBadgeText: { fontWeight: '700', fontSize: 11, letterSpacing: 0.1 },
  totalVal: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: -0.3,
  },
  eta: {
    marginTop: 10,
    color: '#F59E0B',
    fontWeight: '600',
    fontSize: 13,
  },
  driverLine: {
    marginTop: 8,
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
    marginTop: 16,
  },
  openCue: {
    color: '#34D399',
    fontWeight: '700',
    fontSize: 13,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  reportText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
});
