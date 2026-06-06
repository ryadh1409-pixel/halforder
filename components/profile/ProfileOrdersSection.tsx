import {
  canCancelProfileOrder,
  profileOrderBadgeTone,
  profileOrderStatusActive,
  profileOrderStatusIcon,
  profileOrderStatusLabel,
} from '@/constants/profileOrders';
import type { ProfileOrderRow } from '@/hooks/useProfileOrders';
import {
  buildFreshProfileOrders,
  formatOrderExpiresIn,
  formatProfileOrderAge,
  getOrderTimestamp,
} from '@/lib/userOrderFreshness';
import { formatOrderDate, formatOrderTime } from '@/utils/orderTime';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type Palette = {
  card: string;
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  onPrimary: string;
  danger: string;
  success: string;
};

type Props = {
  pal: Palette;
  /** In-progress orders — excludes completed/cancelled. */
  orders: ProfileOrderRow[];
  /** Completed/delivered orders (order history). */
  completedOrders?: ProfileOrderRow[];
  /** Recently cancelled orders (separate from active list). */
  cancelledOrders?: ProfileOrderRow[];
  loading: boolean;
  refreshing: boolean;
  errorMessage: string | null;
  indexBuilding: boolean;
  cancellingIds: Record<string, boolean>;
  onOpenOrder: (orderId: string) => void;
  onCancelOrder: (order: ProfileOrderRow) => Promise<boolean>;
  onRetry: () => void | Promise<void>;
};

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function groupLabel(order: ProfileOrderRow): 'Today' | 'Yesterday' | 'Earlier' {
  const ms = getOrderTimestamp(order);
  if (!ms) return 'Earlier';
  const d = new Date(ms);
  const now = new Date();
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startD = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.floor((startNow - startD) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return 'Earlier';
}

export function ProfileOrdersSection({
  pal,
  orders,
  completedOrders = [],
  cancelledOrders = [],
  loading,
  refreshing,
  errorMessage,
  indexBuilding,
  cancellingIds,
  onOpenOrder,
  onCancelOrder,
  onRetry,
}: Props) {
  const activePulse = useRef(new Animated.Value(0)).current;

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(activePulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(activePulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [activePulse]);

  const [confirmingOrder, setConfirmingOrder] = React.useState<ProfileOrderRow | null>(null);
  const [locallyCancelledOrderIds, setLocallyCancelledOrderIds] = React.useState<
    Record<string, boolean>
  >({});

  const askCancel = (order: ProfileOrderRow) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setConfirmingOrder(order);
  };

  const closeSheet = () => setConfirmingOrder(null);

  const confirmCancel = async () => {
    if (!confirmingOrder) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const target = confirmingOrder;
    setConfirmingOrder(null);
    const ok = await onCancelOrder(target);
    if (ok) {
      setLocallyCancelledOrderIds((prev) => ({ ...prev, [target.id]: true }));
    }
  };

  const freshOrders = useMemo(
    () => buildFreshProfileOrders(orders, { nowMs }),
    [orders, nowMs],
  );

  const freshCancelledOrders = useMemo(
    () => buildFreshProfileOrders(cancelledOrders, { nowMs }),
    [cancelledOrders, nowMs],
  );

  const freshCompletedOrders = useMemo(
    () => buildFreshProfileOrders(completedOrders, { nowMs }),
    [completedOrders, nowMs],
  );

  const grouped = useMemo(
    () =>
      freshOrders.reduce<Record<'Today' | 'Yesterday' | 'Earlier', ProfileOrderRow[]>>(
        (acc, o) => {
          const key = groupLabel(o);
          acc[key].push(o);
          return acc;
        },
        { Today: [], Yesterday: [], Earlier: [] },
      ),
    [freshOrders],
  );

  return (
    <View>
      <Text style={[styles.sectionHeading, { color: pal.text }]}>Your Orders</Text>
      <Text style={[styles.sectionSub, { color: pal.textSecondary }]}>
        Orders from the last 24 hours
      </Text>

      <View style={[styles.container, { backgroundColor: pal.card, borderColor: pal.border }]}>
        {loading || indexBuilding ? (
          <View style={styles.skeletonWrap}>
            {indexBuilding ? (
              <View style={styles.preparingHeader}>
                <Text style={[styles.preparingTitle, { color: pal.text }]}>
                  Preparing your orders
                </Text>
                <Text style={[styles.preparingSub, { color: pal.textSecondary }]}>
                  We're optimizing your order history. This usually takes a few minutes.
                </Text>
                <TouchableOpacity
                  style={[styles.retryBtn, { backgroundColor: pal.primary }]}
                  onPress={() => void onRetry()}
                >
                  <Text style={{ color: pal.onPrimary, fontWeight: '700' }}>Retry now</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {[0, 1, 2].map((k) => (
              <View key={k} style={[styles.skeletonRow, { backgroundColor: 'rgba(255,255,255,0.06)' }]} />
            ))}
          </View>
        ) : errorMessage ? (
          <View style={styles.centerState}>
            <MaterialIcons name="error-outline" size={24} color={pal.danger} />
            <Text style={[styles.emptyTitle, { color: pal.text }]}>Could not load orders</Text>
            <Text style={[styles.emptySub, { color: pal.textSecondary }]}>{errorMessage}</Text>
            <TouchableOpacity style={[styles.retryBtn, { backgroundColor: pal.primary }]} onPress={() => void onRetry()}>
              <Text style={{ color: pal.onPrimary, fontWeight: '700' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : freshOrders.length === 0 && freshCompletedOrders.length === 0 && freshCancelledOrders.length === 0 ? (
          <View style={styles.centerState}>
            <MaterialIcons name="receipt-long" size={30} color={pal.textTertiary} />
            <Text style={[styles.emptyTitle, { color: pal.text }]}>
              No recent orders in the last 24 hours
            </Text>
            <Text style={[styles.emptySub, { color: pal.textSecondary }]}>
              New orders will appear here as soon as you place them.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {(['Today', 'Yesterday', 'Earlier'] as const).map((group) => {
              if (grouped[group].length === 0) return null;
              return (
                <View key={group} style={styles.groupWrap}>
                  <Text style={[styles.groupTitle, { color: pal.textSecondary }]}>{group}</Text>
                  {grouped[group].map((order) => {
              const forcedCancelled = Boolean(locallyCancelledOrderIds[order.id]);
              const effectiveStatus = forcedCancelled ? 'cancelled' : order.status;
              const effectiveDeliveryStatus = forcedCancelled
                ? 'cancelled'
                : order.deliveryStatus;
              const tone = profileOrderBadgeTone(effectiveStatus, effectiveDeliveryStatus);
              const badgeIcon = profileOrderStatusIcon(
                effectiveStatus,
                effectiveDeliveryStatus,
              );
              const active = profileOrderStatusActive(
                effectiveStatus,
                effectiveDeliveryStatus,
              );
              const badgeStyle =
                tone === 'green'
                  ? { bg: '#16A34A', fg: '#FFFFFF' }
                  : tone === 'red'
                    ? { bg: '#DC2626', fg: '#FFFFFF' }
                    : tone === 'blue'
                      ? { bg: 'rgba(59,130,246,0.2)', fg: '#93C5FD' }
                      : tone === 'orange'
                        ? { bg: 'rgba(251,146,60,0.2)', fg: '#FDBA74' }
                        : { bg: 'rgba(255,255,255,0.1)', fg: pal.textSecondary };
              const cancelEnabled = canCancelProfileOrder({
                status: effectiveStatus,
                deliveryStatus: effectiveDeliveryStatus,
                paymentStatus: order.paymentStatus,
              });
              const isCancelling = Boolean(cancellingIds[order.id]);
              const orderTs = getOrderTimestamp(order);
              const expiresLabel = formatOrderExpiresIn(orderTs, nowMs);
              return (
                <TouchableOpacity
                  key={order.id}
                  style={[styles.rowCard, { borderColor: pal.border }]}
                  activeOpacity={0.85}
                  disabled={isCancelling}
                  onPress={() => onOpenOrder(order.id)}
                >
                  <Animated.View style={{ opacity: isCancelling ? 0.55 : 1 }}>
                    <Image
                      source={order.imageUrl ?? undefined}
                      style={styles.thumb}
                      contentFit="cover"
                    />
                  </Animated.View>
                  <View style={styles.mainCol}>
                    <View style={styles.topLine}>
                      <Text
                        style={[
                          styles.restaurant,
                          { color: pal.text },
                          effectiveStatus === 'cancelled'
                            ? { textDecorationLine: 'line-through', opacity: 0.75 }
                            : null,
                        ]}
                        numberOfLines={1}
                      >
                        {order.restaurantName}
                      </Text>
                      <Animated.View
                        style={[
                          styles.badge,
                          { backgroundColor: badgeStyle.bg },
                          active
                            ? {
                                transform: [
                                  {
                                    scale: activePulse.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [1, 1.03],
                                    }),
                                  },
                                ],
                                opacity: activePulse.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.94, 1],
                                }),
                              }
                            : null,
                        ]}
                      >
                        <MaterialIcons
                          name={badgeIcon as never}
                          size={12}
                          color={badgeStyle.fg}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.badgeText, { color: badgeStyle.fg }]}>
                          {profileOrderStatusLabel(
                            effectiveStatus,
                            effectiveDeliveryStatus,
                            order.paymentStatus,
                          )}
                        </Text>
                      </Animated.View>
                    </View>
                    <Text style={[styles.meta, { color: pal.textSecondary }]}>
                      {formatMoney(order.totalPrice)}
                      {' · '}
                      {profileOrderStatusLabel(
                        effectiveStatus,
                        effectiveDeliveryStatus,
                        order.paymentStatus,
                      )}
                    </Text>
                    <View style={styles.ageRow}>
                      <Text style={[styles.meta, styles.ageText, { color: pal.textTertiary }]}>
                        {formatProfileOrderAge(orderTs, nowMs)}
                        {' · '}
                        {formatOrderDate(orderTs)}
                        {' · '}
                        {formatOrderTime(orderTs)}
                      </Text>
                      {expiresLabel ? (
                        <View style={[styles.expiryBadge, { borderColor: pal.border }]}>
                          <MaterialIcons name="schedule" size={11} color={pal.primary} />
                          <Text style={[styles.expiryText, { color: pal.primary }]}>
                            {expiresLabel}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {effectiveStatus === 'cancelled' ? (
                      <Animated.View
                        style={[
                          styles.cancelledState,
                          { backgroundColor: 'rgba(220,38,38,0.14)' },
                          {
                            opacity: activePulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.75, 1],
                            }),
                          },
                        ]}
                      >
                        <MaterialIcons name="highlight-off" size={14} color="#FCA5A5" />
                        <Text style={[styles.cancelledText, { color: '#FCA5A5' }]}>Order cancelled</Text>
                      </Animated.View>
                    ) : cancelEnabled ? (
                      <TouchableOpacity
                        style={[
                          styles.cancelBtn,
                          { backgroundColor: 'rgba(220,38,38,0.18)', opacity: isCancelling ? 0.65 : 1 },
                        ]}
                        disabled={isCancelling}
                        onPress={() => askCancel(order)}
                      >
                        {isCancelling ? (
                          <View style={styles.cancelProgress}>
                            <ActivityIndicator size="small" color={pal.danger} />
                            <Text style={[styles.cancelText, { color: pal.danger }]}>Cancelling...</Text>
                          </View>
                        ) : (
                          <Text style={[styles.cancelText, { color: pal.danger }]}>Cancel order</Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
                  })}
                </View>
              );
            })}
            {freshCompletedOrders.length > 0 ? (
              <View style={styles.groupWrap}>
                <Text style={[styles.groupTitle, { color: pal.textSecondary }]}>
                  Order history
                </Text>
                {freshCompletedOrders.map((order) => {
                  const orderTs = getOrderTimestamp(order);
                  return (
                    <TouchableOpacity
                      key={order.id}
                      style={[styles.rowCard, { borderColor: pal.border }]}
                      activeOpacity={0.85}
                      onPress={() => onOpenOrder(order.id)}
                    >
                      <Image
                        source={order.imageUrl ?? undefined}
                        style={styles.thumb}
                        contentFit="cover"
                      />
                      <View style={styles.mainCol}>
                        <View style={styles.topLine}>
                          <Text style={[styles.restaurant, { color: pal.text }]} numberOfLines={1}>
                            {order.restaurantName}
                          </Text>
                          <View style={[styles.badge, { backgroundColor: '#16A34A' }]}>
                            <Text style={[styles.badgeText, { color: '#FFFFFF' }]}>Delivered</Text>
                          </View>
                        </View>
                        <Text style={[styles.meta, { color: pal.textSecondary }]}>
                          {formatMoney(order.totalPrice)}
                          {' · '}
                          {formatProfileOrderAge(orderTs, nowMs)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            {freshCancelledOrders.length > 0 ? (
              <View style={styles.groupWrap}>
                <Text style={[styles.groupTitle, { color: pal.textSecondary }]}>
                  Cancelled orders
                </Text>
                {freshCancelledOrders.map((order) => {
                  const orderTs = getOrderTimestamp(order);
                  return (
                    <TouchableOpacity
                      key={order.id}
                      style={[styles.rowCard, { borderColor: pal.border, opacity: 0.85 }]}
                      activeOpacity={0.85}
                      onPress={() => onOpenOrder(order.id)}
                    >
                      <Image
                        source={order.imageUrl ?? undefined}
                        style={styles.thumb}
                        contentFit="cover"
                      />
                      <View style={styles.mainCol}>
                        <View style={styles.topLine}>
                          <Text
                            style={[
                              styles.restaurant,
                              { color: pal.text, textDecorationLine: 'line-through', opacity: 0.75 },
                            ]}
                            numberOfLines={1}
                          >
                            {order.restaurantName}
                          </Text>
                          <View style={[styles.badge, { backgroundColor: '#DC2626' }]}>
                            <MaterialIcons
                              name="highlight-off"
                              size={12}
                              color="#FFFFFF"
                              style={{ marginRight: 4 }}
                            />
                            <Text style={[styles.badgeText, { color: '#FFFFFF' }]}>Cancelled</Text>
                          </View>
                        </View>
                        <Text style={[styles.meta, { color: pal.textSecondary }]}>
                          {formatMoney(order.totalPrice)}
                          {' · '}
                          {formatProfileOrderAge(orderTs, nowMs)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        )}
        {refreshing ? (
          <View style={styles.refreshingLine}>
            <ActivityIndicator size="small" color={pal.primary} />
            <Text style={[styles.refreshingText, { color: pal.textSecondary }]}>
              Refreshing orders...
            </Text>
          </View>
        ) : null}
      </View>
      <Modal
        visible={confirmingOrder != null}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closeSheet} />
        <View style={styles.sheetWrap}>
          <View style={[styles.sheetCard, { backgroundColor: 'rgba(20,20,22,0.94)', borderColor: 'rgba(255,255,255,0.12)' }]}>
            <View style={styles.sheetIconWrap}>
              <MaterialIcons name="warning-amber" size={24} color="#F87171" />
            </View>
            <Text style={styles.sheetTitle}>Cancel this order?</Text>
            <Text style={styles.sheetSub}>
              This action cannot be undone. The order will be marked cancelled immediately.
            </Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.keepBtn} onPress={closeSheet}>
                <Text style={styles.keepBtnText}>Keep order</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelCta} onPress={() => void confirmCancel()}>
                <Text style={styles.cancelCtaText}>Cancel order</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeading: { fontSize: 20, fontWeight: '700', marginTop: 6 },
  sectionSub: { fontSize: 13, marginTop: 4, marginBottom: 10 },
  container: { borderRadius: 16, borderWidth: 1, padding: 12 },
  skeletonWrap: { gap: 10 },
  preparingHeader: { marginBottom: 8 },
  preparingTitle: { fontSize: 16, fontWeight: '800' },
  preparingSub: { marginTop: 4, fontSize: 13 },
  skeletonRow: { height: 88, borderRadius: 12 },
  centerState: { paddingVertical: 22, alignItems: 'center' },
  emptyTitle: { marginTop: 8, fontSize: 16, fontWeight: '700' },
  emptySub: { marginTop: 4, fontSize: 13, textAlign: 'center' },
  retryBtn: { marginTop: 12, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  list: { gap: 10 },
  groupWrap: { gap: 10 },
  groupTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  rowCard: { borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: 'row', gap: 10 },
  thumb: { width: 58, height: 58, borderRadius: 12, backgroundColor: '#1F2937' },
  mainCol: { flex: 1 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  restaurant: { flex: 1, fontSize: 15, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  meta: { marginTop: 3, fontSize: 12 },
  ageRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ageText: { flex: 1, marginTop: 0 },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  expiryText: { fontSize: 10, fontWeight: '700' },
  cancelBtn: {
    marginTop: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  cancelText: { fontSize: 12, fontWeight: '700' },
  cancelProgress: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cancelledState: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cancelledText: { fontSize: 12, fontWeight: '700' },
  refreshingLine: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  refreshingText: { fontSize: 12 },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
  },
  sheetCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  sheetIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(248,113,113,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  sheetTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  sheetSub: { color: 'rgba(255,255,255,0.72)', marginTop: 6, fontSize: 13, lineHeight: 19 },
  sheetActions: { marginTop: 14, gap: 10 },
  keepBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  keepBtnText: { color: '#FFFFFF', fontWeight: '700' },
  cancelCta: {
    borderRadius: 12,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelCtaText: { color: '#FFFFFF', fontWeight: '800' },
});
