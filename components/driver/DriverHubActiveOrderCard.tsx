import { isDriverActiveMarketplaceOrder } from '@/lib/driverHubActiveOrders';
import { markDriverHubOrderCompleted } from '@/lib/driverHubOrdersStore';
import {
  applyDriverMarketplaceFulfillment,
  driverHubActiveStatusLabel,
  getDriverMarketplaceFulfillmentButton,
} from '@/lib/driverMarketplaceFulfillment';
import { DRIVER_DELIVERY_COMPLETE_TOAST } from '@/lib/driverDeliveryCompletion';
import { DRIVER_ROUTES } from '@/lib/navigationPaths';
import type { DriverOrder } from '@/services/driverService';
import { showError, showSuccess } from '@/utils/toast';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  order: DriverOrder;
  driverUid: string;
};

export function DriverHubActiveOrderCard({ order, driverUid }: Props) {
  const [busy, setBusy] = useState(false);
  const isActive = isDriverActiveMarketplaceOrder(
    {
      driverId: order.driverId,
      assignedDriverId: order.assignedDriverId,
      deliveryStatus: order.deliveryStatus,
      status: order.status,
      deliveredAtMs: order.deliveredAtMs ?? null,
    },
    driverUid,
  );
  if (!isActive) return null;
  const statusLabel = driverHubActiveStatusLabel(order.deliveryStatus);
  const action = getDriverMarketplaceFulfillmentButton(
    {
      id: order.id,
      driverId: order.driverId,
      assignedDriverId: order.assignedDriverId,
      deliveryStatus: order.deliveryStatus,
    },
    driverUid,
  );

  async function onFulfillment() {
    if (!action || busy) return;
    setBusy(true);
    try {
      const result = await applyDriverMarketplaceFulfillment(
        order.id,
        action.action,
        {
          id: order.id,
          driverId: order.driverId,
          assignedDriverId: order.assignedDriverId,
          deliveryStatus: order.deliveryStatus,
        },
      );
      if (result === 'skipped_illegal') {
        showError(
          action.action === 'arrive_restaurant'
            ? 'Cannot mark arrival for this order yet.'
            : action.action === 'pickup'
              ? 'Confirm arrival at the restaurant before pickup.'
              : 'Pick up the order before completing delivery.',
        );
        return;
      }
      if (result === 'skipped_duplicate') {
        showError('Could not save delivery status. Pull to refresh and try again.');
        return;
      }
      if (action.action === 'deliver') {
        markDriverHubOrderCompleted(order.id, 'hub_card_deliver', { driverOrder: order });
        showSuccess(DRIVER_DELIVERY_COMPLETE_TOAST);
        router.replace(DRIVER_ROUTES.hub as never);
        return;
      }
      showSuccess(
        action.action === 'arrive_restaurant'
          ? 'Arrived at restaurant'
          : 'Pickup confirmed',
      );
    } catch {
      showError('Could not update delivery');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => {
          if (!isActive) return;
          router.push(DRIVER_ROUTES.activeOrder(order.id) as never);
        }}
      >
        <View style={styles.topRow}>
          <Text style={styles.title}>Current delivery</Text>
          <Text style={styles.payout}>${order.total.toFixed(2)}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusText}>{statusLabel}</Text>
        </View>
        <Text style={styles.restaurant}>{order.restaurantName}</Text>
        <Text style={styles.meta}>Customer: {order.customerName ?? 'Customer'}</Text>
        <Text style={styles.meta}>
          Pickup: {order.restaurantAddress ?? 'Restaurant address unavailable'}
        </Text>
        <Text style={styles.meta}>
          Drop-off: {order.deliveryAddress ?? 'Address unavailable'}
        </Text>
        <Text style={styles.openDetail}>Open delivery details →</Text>
      </Pressable>

      {action ? (
        <Pressable
          style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
          disabled={busy}
          onPress={() => void onFulfillment()}
        >
          {busy ? (
            <ActivityIndicator color="#052e1b" />
          ) : (
            <Text style={styles.actionBtnText}>{action.label}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#132B1E',
    borderWidth: 1,
    borderColor: '#00C853',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#A7F3D0', fontWeight: '800', fontSize: 15 },
  payout: { color: '#00E676', fontWeight: '900', fontSize: 18 },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 200, 83, 0.35)',
  },
  statusText: { color: '#86EFAC', fontWeight: '800', fontSize: 12 },
  restaurant: { color: '#FFFFFF', marginTop: 10, fontSize: 16, fontWeight: '800' },
  meta: { color: '#D1FAE5', marginTop: 4, fontWeight: '600', fontSize: 13 },
  openDetail: { color: '#6EE7B7', marginTop: 10, fontWeight: '700', fontSize: 12 },
  actionBtn: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#00C853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#052e1b', fontWeight: '900', fontSize: 16 },
});
