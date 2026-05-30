import AppHeader from '@/components/AppHeader';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import { orderRoomHref } from '@/services/orderChat';
import type { OrderStatus } from '@/services/orderService';
import {
  rejectOrder,
  updateOrderStatus,
  type RestaurantOrder,
} from '@/services/orderService';
import { formatAddress, formatOrderStatus, formatRestaurantName } from '@/utils/orderFormatters';
import { showError, showSuccess } from '@/utils/toast';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RestaurantOrderDetailsScreen({ order }: { order: RestaurantOrder }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const prepSeconds = useMemo(() => {
    if (!order.acceptedAtMs) return 0;
    if (
      order.status === 'delivered' ||
      order.status === 'cancelled' ||
      order.status === 'rejected'
    ) {
      return 0;
    }
    return Math.max(0, Math.floor((now - order.acceptedAtMs) / 1000));
  }, [now, order.acceptedAtMs, order.status]);

  const paid = order.paymentStatus === 'paid';

  const canAccept =
    paid &&
    (order.status === 'awaiting_payment' ||
      order.status === 'pending' ||
      order.status === 'pending_driver' ||
      order.status === 'accepted');

  const canReject =
    order.status === 'pending' ||
    order.status === 'pending_driver' ||
    order.status === 'accepted' ||
    order.status === 'awaiting_payment';

  const canMarkPreparing = paid && order.status === 'restaurant_accepted';

  const canMarkReady =
    paid &&
    (order.status === 'preparing' ||
      order.status === 'restaurant_accepted' ||
      order.status === 'accepted');

  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      showSuccess(label);
    } catch {
      showError('Could not update order');
    } finally {
      setBusy(false);
    }
  }

  async function patchStatus(next: OrderStatus) {
    await updateOrderStatus(order.id, next);
  }

  if (!isOrderFresh(order)) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Kitchen order" />
        <View style={styles.emptyWrap}>
          <Text style={styles.title}>Order no longer available</Text>
          <Text style={styles.muted}>
            Restaurant dashboards only show orders from the last 24 hours.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Kitchen order" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Incoming</Text>
          <Text style={styles.title}>#{order.id.slice(0, 8)}</Text>
          <Text style={styles.status}>{formatOrderStatus(order.status)}</Text>
          {order.acceptedAtMs && prepSeconds > 0 ? (
            <Text style={styles.timer}>Prep timer · {formatElapsed(prepSeconds)}</Text>
          ) : (
            <Text style={styles.timerMuted}>Prep timer starts after you accept.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer & dropoff</Text>
          <Text style={styles.bodyStrong}>{order.customer?.name || 'Customer'}</Text>
          <Text style={styles.body}>{formatAddress(order.deliveryLocation?.address)}</Text>
          <Text style={styles.cardTitle}>Notes</Text>
          <Text style={styles.body}>{order.notes?.trim() ? order.notes : '—'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Driver</Text>
          {order.driverId ? (
            <>
              <Text style={styles.bodyStrong}>
                {order.driver?.name || order.driverName || 'Assigned driver'}
              </Text>
              <Text style={styles.body}>{order.driver?.phone || order.driverPhone || ''}</Text>
              <Pressable
                style={styles.outlineBtn}
                onPress={() =>
                  router.push(orderRoomHref(order.id, ORDER_CHAT_TYPE.RESTAURANT_DRIVER) as never)
                }
              >
                <Text style={styles.outlineBtnText}>Chat driver</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.muted}>No driver yet — you’ll be notified when someone claims pickup.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Items</Text>
          {order.items?.length ? (
            order.items.map((it) => (
              <Text key={`${it.id}-${it.name}`} style={styles.item}>
                {it.qty}× {it.name}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>No items.</Text>
          )}
        </View>

        <View style={styles.actions}>
          {canAccept ? (
            <Pressable
              style={styles.acceptBtn}
              disabled={busy}
              onPress={() => void run('Order accepted', () => patchStatus('restaurant_accepted'))}
            >
              {busy ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.acceptText}>Accept order</Text>}
            </Pressable>
          ) : null}

          {canReject ? (
            <Pressable
              style={styles.rejectBtn}
              disabled={busy}
              onPress={() =>
                void run('Order rejected', async () => {
                  await rejectOrder(order.id);
                })
              }
            >
              <Text style={styles.rejectText}>Reject</Text>
            </Pressable>
          ) : null}

          {canMarkPreparing ? (
            <Pressable
              style={styles.secondaryBtn}
              disabled={busy}
              onPress={() => void run('Preparing', () => patchStatus('preparing'))}
            >
              <Text style={styles.secondaryText}>Start preparing</Text>
            </Pressable>
          ) : null}

          {canMarkReady && order.status !== 'ready_for_pickup' ? (
            <Pressable
              style={styles.readyBtn}
              disabled={busy}
              onPress={() => void run('Ready for pickup', () => patchStatus('ready_for_pickup'))}
            >
              <Text style={styles.readyText}>Mark ready for pickup</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.footer}>
          Restaurant: {formatRestaurantName(order.restaurant?.name)}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0c0a09' },
  scroll: { padding: 16, paddingBottom: 40 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  header: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    backgroundColor: '#1c1410',
  },
  kicker: { color: '#fcd34d', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  title: { color: '#fff7ed', fontWeight: '900', fontSize: 26, marginTop: 6 },
  status: { color: 'rgba(254,243,199,0.85)', fontWeight: '700', marginTop: 8 },
  timer: { color: '#fde68a', fontWeight: '800', marginTop: 10, fontSize: 18 },
  timerMuted: { color: 'rgba(253,230,138,0.55)', marginTop: 10, fontWeight: '600' },
  card: {
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#14120f',
  },
  cardTitle: { color: '#a8a29e', fontWeight: '800', fontSize: 12, marginBottom: 8, marginTop: 8 },
  body: { color: '#e7e5e4', fontWeight: '600', fontSize: 15, lineHeight: 22 },
  bodyStrong: { color: '#fafaf9', fontWeight: '800', fontSize: 17 },
  muted: { color: 'rgba(231,229,228,0.65)', fontWeight: '600' },
  item: { color: '#fafaf9', fontWeight: '600', marginTop: 6 },
  outlineBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.45)',
    alignItems: 'center',
  },
  outlineBtnText: { color: '#fde68a', fontWeight: '800' },
  actions: { marginTop: 18, gap: 12 },
  acceptBtn: {
    backgroundColor: '#fbbf24',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  acceptText: { color: '#0c0a09', fontWeight: '900', fontSize: 17 },
  rejectBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.5)',
    alignItems: 'center',
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  rejectText: { color: '#fecaca', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#422006',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    alignItems: 'center',
  },
  secondaryText: { color: '#fde68a', fontWeight: '900', fontSize: 16 },
  readyBtn: {
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: '#15803d',
    alignItems: 'center',
  },
  readyText: { color: '#ecfccb', fontWeight: '900', fontSize: 17 },
  footer: { marginTop: 22, color: 'rgba(231,229,228,0.5)', fontWeight: '600', textAlign: 'center' },
});
