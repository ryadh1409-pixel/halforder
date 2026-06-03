import AppHeader from '@/components/AppHeader';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import {
  applyDriverMarketplaceFulfillment,
  driverMarketplaceFulfillmentStatusHint,
  getDriverMarketplaceFulfillmentButton,
} from '@/lib/driverMarketplaceFulfillment';
import { marketplaceDeliveryStatusLabel } from '@/lib/orderStatus';
import type { RestaurantOrder } from '@/services/orderService';
import {
  acceptQueuedDeliveryOrder,
  type DriverProfile,
} from '@/services/driverService';
import { useAuth } from '@/services/AuthContext';
import { formatAddress, formatRestaurantName } from '@/utils/orderFormatters';
import { showError, showNotice, showSuccess } from '@/utils/toast';
import * as Linking from 'expo-linking';
import { orderRoomHref } from '@/services/orderChat';
import { updateDriverLiveLocation } from '@/services/delivery';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppTextInput } from '../../AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

function navUrl(lat: number, lng: number, label: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=&travelmode=driving`;
}

export function DriverOrderDetailsScreen({ order }: { order: RestaurantOrder }) {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [deliverPin, setDeliverPin] = useState('');
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const driverProfile: DriverProfile | null = useMemo(() => {
    if (!user?.uid) return null;
    return {
      id: user.uid,
      name: user.displayName?.trim() || 'Driver',
      phone: user.phoneNumber ?? null,
      isOnline: true,
    };
  }, [user]);

  const assignedToMe = order.driverId === user?.uid;
  const canClaim =
    !order.driverId &&
    driverProfile &&
    order.paymentStatus === 'paid' &&
    (order.deliveryStatus === 'accepted' ||
      order.deliveryStatus === 'preparing' ||
      order.deliveryStatus === 'ready_for_pickup' ||
      order.deliveryStatus === 'waiting_driver');

  useEffect(() => {
    if (!assignedToMe || !user?.uid || Platform.OS === 'web') return undefined;
    if (order.status === 'delivered' || order.status === 'cancelled') return undefined;

    let cancelled = false;
    const uid = user.uid;
    void Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (cancelled || status !== 'granted') return;
      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 35,
        },
        (pos) => {
          void updateDriverLiveLocation(order.id, uid, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
          });
        },
      ).then((sub) => {
        if (!cancelled) watchRef.current = sub;
      });
    });

    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [assignedToMe, user?.uid, order.id, order.status]);

  const fulfillmentAction = assignedToMe
    ? getDriverMarketplaceFulfillmentButton(order, user?.uid)
    : null;
  const fulfillmentHint = assignedToMe
    ? driverMarketplaceFulfillmentStatusHint(order, user?.uid)
    : null;
  const statusLabel = marketplaceDeliveryStatusLabel(order.deliveryStatus);

  const payoutEst = Math.max(0, order.deliveryFee) * 0.72;

  const navigateTarget =
    order.status === 'picked_up' ||
    order.status === 'on_the_way' ||
    order.status === 'arrived_customer'
      ? order.deliveryLocation
      : order.restaurantLocation;

  async function onClaim() {
    if (!driverProfile || !canClaim || busy) return;
    setBusy(true);
    try {
      const res = await acceptQueuedDeliveryOrder(order.id, driverProfile);
      if (!res.ok) {
        showError(res.reason === 'already_assigned' ? 'Already assigned' : 'Cannot accept this order');
        return;
      }
      showSuccess('Order accepted');
      showNotice('Head to the restaurant', 'Pickup instructions are below.');
    } catch {
      showError('Could not accept order');
    } finally {
      setBusy(false);
    }
  }

  async function onFulfillment() {
    if (!fulfillmentAction || busy) return;
    if (fulfillmentAction.action === 'deliver' && order.deliveryPin) {
      if (deliverPin.trim() !== order.deliveryPin) {
        showError('Enter the 4-digit delivery PIN from the customer.');
        return;
      }
    }
    setBusy(true);
    try {
      const result = await applyDriverMarketplaceFulfillment(
        order.id,
        fulfillmentAction.action,
        order,
      );
      if (result === 'skipped_illegal') {
        showError(
          fulfillmentAction.action === 'pickup'
            ? 'Order is not ready for pickup yet.'
            : 'Pick up the order before completing delivery.',
        );
        return;
      }
      showSuccess(
        fulfillmentAction.action === 'pickup' ? 'Picked up' : 'Delivery completed',
      );
      if (fulfillmentAction.action === 'deliver') {
        showNotice('Great job', 'Delivery completed.');
        setDeliverPin('');
      }
    } catch {
      showError('Could not update status');
    } finally {
      setBusy(false);
    }
  }

  const customerPhone = order.customerPhone;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Delivery" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.status}>{statusLabel}</Text>
          <Text style={styles.restaurant}>{formatRestaurantName(order.restaurant?.name)}</Text>
          <Text style={styles.meta}>{formatAddress(order.restaurant?.address)}</Text>
          <View style={styles.payout}>
            <Text style={styles.payoutLabel}>Est. payout</Text>
            <Text style={styles.payoutVal}>${payoutEst.toFixed(2)}</Text>
            <Text style={styles.payoutHint}>Based on delivery fee — final settlement may vary.</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pickup</Text>
          <Text style={styles.body}>{formatAddress(order.restaurant?.address) || 'Restaurant address unavailable'}</Text>
          <Text style={styles.cardTitle}>Customer dropoff</Text>
          <Text style={styles.body}>{formatAddress(order.deliveryLocation?.address)}</Text>
          <Text style={styles.cardTitle}>Instructions</Text>
          <Text style={styles.body}>{order.notes?.trim() ? order.notes : 'No special instructions.'}</Text>
        </View>

        <View style={styles.row}>
          {navigateTarget && typeof navigateTarget.lat === 'number' ? (
            <Pressable
              style={styles.navBtn}
              onPress={() =>
                void Linking.openURL(navUrl(navigateTarget.lat, navigateTarget.lng, 'stop'))
              }
            >
              <Text style={styles.navBtnText}>Open navigation</Text>
            </Pressable>
          ) : null}
        </View>

        {canClaim ? (
          <Pressable style={styles.primaryBtn} disabled={busy} onPress={() => void onClaim()}>
            {busy ? (
              <ActivityIndicator color="#052e1b" />
            ) : (
              <Text style={styles.primaryBtnText}>Accept order</Text>
            )}
          </Pressable>
        ) : null}

        {fulfillmentHint && !fulfillmentAction ? (
          <Text style={styles.waitingHint}>{fulfillmentHint}</Text>
        ) : null}

        {fulfillmentAction?.action === 'deliver' && order.deliveryPin ? (
          <View style={styles.pinBox}>
            <Text style={styles.pinLabel}>Customer delivery PIN</Text>
            <AppTextInput
              value={deliverPin}
              onChangeText={setDeliverPin}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="••••"
              placeholderTextColor="rgba(148,163,184,0.5)"
              style={styles.pinInput}
            />
          </View>
        ) : null}

        {fulfillmentAction ? (
          <Pressable style={styles.secondaryBtn} disabled={busy} onPress={() => void onFulfillment()}>
            {busy ? (
              <ActivityIndicator color="#e0f2fe" />
            ) : (
              <Text style={styles.secondaryBtnText}>{fulfillmentAction.label}</Text>
            )}
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Coordinate</Text>
          <Pressable
            style={styles.linkBtn}
            disabled={!assignedToMe}
            onPress={() =>
              router.push(orderRoomHref(order.id, ORDER_CHAT_TYPE.CUSTOMER_DRIVER) as never)
            }
          >
            <Text style={styles.linkBtnText}>Chat customer</Text>
          </Pressable>
          {!assignedToMe ? (
            <Text style={styles.muted}>Accept the order to message the customer.</Text>
          ) : null}

          <Pressable
            style={[styles.linkBtn, { marginTop: 10 }]}
            onPress={() =>
              router.push(orderRoomHref(order.id, ORDER_CHAT_TYPE.RESTAURANT_DRIVER) as never)
            }
          >
            <Text style={styles.linkBtnText}>Chat restaurant</Text>
          </Pressable>

          {customerPhone ? (
            <Pressable style={[styles.linkBtn, { marginTop: 10 }]} onPress={() => void Linking.openURL(`tel:${customerPhone}`)}>
              <Text style={styles.linkBtnText}>Call customer</Text>
            </Pressable>
          ) : (
            <Text style={styles.muted}>Customer phone not on file.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Items</Text>
          {order.items?.length ? (
            order.items.map((it) => (
              <Text key={`${it.id}-${it.name}`} style={styles.itemLine}>
                {it.qty}× {it.name}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>No items listed</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020617' },
  scroll: { padding: 16, paddingBottom: 40 },
  hero: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.25)',
  },
  status: { color: '#a7f3d0', fontWeight: '800', fontSize: 13, marginBottom: 6 },
  restaurant: { color: '#f8fafc', fontWeight: '900', fontSize: 22 },
  meta: { color: 'rgba(226,232,240,0.75)', marginTop: 8, fontWeight: '600', fontSize: 14 },
  payout: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  payoutLabel: { color: '#94a3b8', fontWeight: '700', fontSize: 12 },
  payoutVal: { color: '#34d399', fontWeight: '900', fontSize: 28, marginTop: 4 },
  payoutHint: { color: 'rgba(148,163,184,0.85)', fontSize: 11, marginTop: 6, fontWeight: '600' },
  card: {
    marginTop: 14,
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  cardTitle: { color: '#94a3b8', fontWeight: '800', fontSize: 12, marginBottom: 6, marginTop: 10 },
  body: { color: '#e2e8f0', fontWeight: '600', fontSize: 15, lineHeight: 22 },
  muted: { color: 'rgba(148,163,184,0.85)', fontWeight: '600', marginTop: 8 },
  itemLine: { color: '#e2e8f0', fontWeight: '600', marginTop: 6 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  navBtn: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  navBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: '#22c55e',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#052e1b', fontWeight: '900', fontSize: 17 },
  secondaryBtn: {
    marginTop: 12,
    backgroundColor: '#0284c7',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#e0f2fe', fontWeight: '900', fontSize: 17 },
  pinBox: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  pinLabel: { color: '#fde68a', fontWeight: '800', fontSize: 12 },
  pinInput: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 8,
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  linkBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.35)',
    alignItems: 'center',
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  linkBtnText: { color: '#7dd3fc', fontWeight: '800', fontSize: 15 },
  waitingHint: { color: '#94a3b8', fontWeight: '600', fontSize: 14, marginTop: 12, lineHeight: 20 },
});
