import OrderActions from '@/components/orders/OrderActions';
import { PaymentBadge } from '@/components/orders/StatusBadge';
import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import { applyStageLockToOrder } from '@/lib/orderStageLock';
import { traceOrderStageRender } from '@/lib/orderStageTrace';
import type { RestaurantKitchenAction } from '@/lib/restaurantKitchenActions';
import type { OrderStatus, RestaurantOrder } from '@/services/orderService';
import { getRestaurantOrderPresentation } from '@/services/orderStage';
import {
  formatOrderDate,
  formatOrderTime,
  formatRelativeAge,
  safePhone,
} from '@/utils/orderTime';
import { platformElevation } from '@/utils/platformElevation';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  order: RestaurantOrder;
  timeZone?: string;
  sourceScreen?: string;
  onStatus: (status: OrderStatus) => void;
  onReject: () => void;
  loading?: boolean;
  pendingAction?: RestaurantKitchenAction | null;
};

function customerDisplayName(order: RestaurantOrder): string {
  const name = order.customerName?.trim() || order.customer?.name?.trim();
  if (name) return name;
  const uid = order.userId?.trim();
  return uid ? `Guest ${uid.slice(0, 8)}` : 'Guest';
}

function deliveryAddressLine(order: RestaurantOrder): string {
  const address =
    order.deliveryLocation?.address?.trim()
    || order.customer?.address?.trim()
    || null;
  return address && address.length > 0 ? address : 'Address unavailable';
}

function safeTotal(price: number | null | undefined): string {
  if (typeof price !== 'number' || !Number.isFinite(price)) return '$0.00';
  return `$${price.toFixed(2)}`;
}

function safeEta(minutes: number | null | undefined): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) {
    return '—';
  }
  return `${Math.round(minutes)} min`;
}

export function RestaurantLiveOrderCard({
  order,
  timeZone,
  sourceScreen = 'RestaurantLiveOrderCard',
  onStatus,
  onReject,
  loading,
  pendingAction = null,
}: Props) {
  const displayOrder = useMemo(() => applyStageLockToOrder(order), [order]);

  const presentation = useMemo(() => {
    traceOrderStageRender(displayOrder, { sourceScreen });
    return getRestaurantOrderPresentation(displayOrder);
  }, [displayOrder, sourceScreen]);

  const timeOpts = { timeZone };

  const itemLines = useMemo(
    () =>
      Array.isArray(order.items)
        ? order.items.map(
            (item) =>
              `Qty ${item.qty ?? 1} · ${item.name ?? 'Item'}`,
          )
        : [],
    [order.items],
  );
  const itemCount = useMemo(
    () =>
      Array.isArray(order.items)
        ? order.items.reduce((sum, item) => sum + (item.qty ?? 1), 0)
        : 0,
    [order.items],
  );

  const dateLabel = useMemo(
    () => formatOrderDate(order.createdAtMs, timeOpts),
    [order.createdAtMs, timeZone],
  );
  const clockLabel = useMemo(
    () => formatOrderTime(order.createdAtMs, timeOpts),
    [order.createdAtMs, timeZone],
  );
  const ageLabel = useMemo(
    () => formatRelativeAge(order.createdAtMs, timeOpts),
    [order.createdAtMs, timeZone],
  );

  if (!isOrderFresh(order)) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.customerName}>{customerDisplayName(order)}</Text>
          <Text style={styles.phone}>
            {safePhone(order.customerPhone, null)}
          </Text>
        </View>
        <View
          style={[
            styles.kitchenBadge,
            { backgroundColor: presentation.badgeColor.bg },
          ]}
        >
          <Text style={[styles.kitchenBadgeText, { color: presentation.badgeColor.fg }]}>
            {presentation.badgeText}
          </Text>
        </View>
      </View>

      <View style={styles.timeBlock}>
        <Text style={styles.dateText}>{dateLabel}</Text>
        <View style={styles.timeMetaRow}>
          <Text style={styles.clockText}>{clockLabel}</Text>
          <Text style={styles.age}>{ageLabel}</Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        {presentation.showPaymentBadge ? (
          <PaymentBadge paymentStatus="unpaid" />
        ) : (
          <View style={styles.courierBadge}>
            <Text style={styles.courierBadgeText}>{presentation.courierBadgeText}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          Items{itemCount > 0 ? ` (${itemCount})` : ''}
        </Text>
        {itemLines.length ? (
          itemLines.map((line, index) => (
            <Text key={`${order.id}-item-${index}`} style={styles.itemLine}>
              {line}
            </Text>
          ))
        ) : (
          <Text style={styles.muted}>No items listed</Text>
        )}
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>Total</Text>
          <Text style={styles.metaValue}>{safeTotal(order.totalPrice)}</Text>
        </View>
        <View style={styles.metaCell}>
          <Text style={styles.metaLabel}>ETA</Text>
          <Text style={styles.metaValue}>{safeEta(order.estimatedDeliveryTime)}</Text>
        </View>
        <View style={[styles.metaCell, styles.metaCellWide]}>
          <Text style={styles.metaLabel}>Driver</Text>
          <Text style={styles.metaValue} numberOfLines={2}>
            {presentation.driverDetailText}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Delivery address</Text>
        <Text style={styles.address}>{deliveryAddressLine(order)}</Text>
      </View>

      <OrderActions
        status={presentation.merchantActionStatus}
        loading={loading}
        pendingAction={pendingAction}
        onAccept={() => onStatus('accepted')}
        onStartPreparing={() => onStatus('preparing')}
        onMarkReady={() => onStatus('ready')}
        onReject={onReject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#09090B',
    padding: 16,
    marginBottom: 14,
    ...platformElevation({
      web: '0px 4px 14px rgba(15, 23, 42, 0.07)',
      ios: {
        shadowColor: '#09090B',
        shadowOpacity: 0.07,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 3 },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  customerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  phone: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#B7BDC9',
  },
  kitchenBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  kitchenBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  timeBlock: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#171923',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 4,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  timeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  clockText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B7BDC9',
  },
  age: {
    fontSize: 13,
    fontWeight: '700',
    color: '#22C55E',
  },
  badgeRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  courierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#1E2230',
  },
  courierBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3730A3',
  },
  section: {
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7D8493',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  itemLine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B7BDC9',
    lineHeight: 20,
  },
  muted: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7D8493',
  },
  metaGrid: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaCell: {
    minWidth: '30%',
    flexGrow: 1,
    backgroundColor: '#171923',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  metaCellWide: {
    minWidth: '100%',
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7D8493',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  address: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B7BDC9',
    lineHeight: 20,
  },
});
