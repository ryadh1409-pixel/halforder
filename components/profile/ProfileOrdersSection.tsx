import {
  canCancelProfileOrder,
  profileOrderBadgeTone,
  profileOrderStatusActive,
  profileOrderStatusIcon,
  profileOrderStatusLabel,
} from '@/constants/profileOrders';
import type { ProfileOrderRow } from '@/hooks/useProfileOrders';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
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
  orders: ProfileOrderRow[];
  loading: boolean;
  refreshing: boolean;
  errorMessage: string | null;
  indexBuilding: boolean;
  cancellingIds: Record<string, boolean>;
  onOpenOrder: (orderId: string) => void;
  onCancelOrder: (order: ProfileOrderRow) => Promise<void>;
  onRetry: () => void | Promise<void>;
};

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatDate(ms: number): string {
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(ms: number): string {
  if (!ms) return '-';
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function groupLabel(ms: number): 'Today' | 'Yesterday' | 'Earlier' {
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
    await onCancelOrder(target);
    setLocallyCancelledOrderIds((prev) => ({ ...prev, [target.id]: true }));
  };

  const grouped = orders.reduce<Record<'Today' | 'Yesterday' | 'Earlier', ProfileOrderRow[]>>(
    (acc, o) => {
      const key = groupLabel(o.createdAtMs);
      acc[key].push(o);
      return acc;
    },
    { Today: [], Yesterday: [], Earlier: [] },
  );

  return (
    <View>
      <Text style={[styles.sectionHeading, { color: pal.text }]}>Your Orders</Text>
      <Text style={[styles.sectionSub, { color: pal.textSecondary }]}>
        Track and manage your recent orders
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
        ) : orders.length === 0 ? (
          <View style={styles.centerState}>
            <MaterialIcons name="receipt-long" size={30} color={pal.textTertiary} />
            <Text style={[styles.emptyTitle, { color: pal.text }]}>No orders yet</Text>
            <Text style={[styles.emptySub, { color: pal.textSecondary }]}>
              Your future HalfOrders will appear here.
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
              const cancelEnabled = canCancelProfileOrder(effectiveStatus);
              const isCancelling = Boolean(cancellingIds[order.id]);
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
                          )}
                        </Text>
                      </Animated.View>
                    </View>
                    <Text style={[styles.meta, { color: pal.textSecondary }]}>
                      {formatMoney(order.totalPrice)} · {order.itemsCount} item{order.itemsCount === 1 ? '' : 's'}
                    </Text>
                    <Text style={[styles.meta, { color: pal.textTertiary }]}>
                      {formatDate(order.createdAtMs)} · {formatTime(order.createdAtMs)}
                    </Text>
                    <Text style={[styles.meta, { color: pal.textSecondary }]}>
                      {profileOrderStatusLabel(effectiveStatus, effectiveDeliveryStatus)}
                    </Text>
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
