/**
 * Admin: Emo AI Order Detail page.
 *
 * Full detail view for a single "I Want Something" concierge order.
 * Isolated — touches only the `orders` collection via subscribeEmoOrder.
 */

import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { adminRoutes } from '@/constants/adminRoutes';
import { isAdminUser } from '@/constants/adminUid';
import { useAuth } from '@/services/AuthContext';
import {
  subscribeEmoOrder,
  formatEmoOrderStatus,
  emoOrderStatusColor,
  formatEmoTs,
  type AdminEmoOrder,
} from '@/services/adminEmoOrdersService';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─────────────────────────────────────────────────────────────────────────────
// 18-step lifecycle
// ─────────────────────────────────────────────────────────────────────────────

const LIFECYCLE_STEPS = [
  { key: 'EMO_ORDER_CREATED', label: 'Order Created' },
  { key: 'RESTAURANT_SELECTED', label: 'Restaurant Selected' },
  { key: 'MEAL_SELECTED', label: 'Meal Selected' },
  { key: 'ADDRESS_CONFIRMED', label: 'Address Confirmed' },
  { key: 'SUMMARY_READY', label: 'Summary Ready' },
  { key: 'PAYMENT_PENDING', label: 'Payment Pending' },
  { key: 'PAYMENT_SUCCEEDED', label: 'Payment Succeeded' },
  { key: 'SEARCHING_DRIVER', label: 'Searching Driver' },
  { key: 'DRIVER_ASSIGNED', label: 'Driver Assigned' },
  { key: 'DRIVER_ACCEPTED', label: 'Driver Accepted' },
  { key: 'DRIVING_TO_RESTAURANT', label: 'Driving to Restaurant' },
  { key: 'ARRIVED_AT_RESTAURANT', label: 'Arrived at Restaurant' },
  { key: 'ORDER_PURCHASED', label: 'Order Purchased' },
  { key: 'DRIVING_TO_CUSTOMER', label: 'Driving to Customer' },
  { key: 'ARRIVED_AT_CUSTOMER', label: 'Arrived at Customer' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'COMPLETED', label: 'Completed' },
] as const;

/** Map order status + deliveryStatus → lifecycle step index (0-based). */
function resolveLifecycleIndex(order: AdminEmoOrder): number {
  const s = order.status.toLowerCase();
  const ds = (order.deliveryStatus ?? '').toLowerCase();
  const ps = order.paymentStatus.toLowerCase();

  if (s === 'completed') return 16;
  if (s === 'delivered' || ds === 'delivered') return 15;
  if (['arrived_at_customer', 'arrived'].includes(ds)) return 14;
  if (['driving_to_customer', 'on_the_way', 'en_route_to_customer', 'picked_up'].includes(ds)) return 13;
  if (['order_purchased', 'purchased'].includes(ds)) return 12;
  if (['arrived_at_restaurant', 'at_restaurant'].includes(ds)) return 11;
  if (['driving_to_restaurant', 'en_route_to_restaurant', 'picking_up'].includes(ds)) return 10;
  if (ds === 'driver_accepted' || s === 'driver_accepted') return 9;
  if (s === 'driver_assigned' || ds === 'driver_assigned') return 8;
  if (s === 'searching_driver' || ds === 'searching_driver') return 7;
  if (ps === 'paid' || ps === 'succeeded' || s === 'payment_confirmed') return 6;
  if (s === 'awaiting_payment' || ps === 'unpaid') return 5;
  if (order.total > 0) return 4; // summary shown
  if (order.deliveryAddress) return 3;
  if (order.mealName && order.mealName !== 'Unknown meal') return 2;
  if (order.restaurantName && order.restaurantName !== 'Unknown restaurant') return 1;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section helpers
// ─────────────────────────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function InfoRow({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.infoMono]} selectable>
        {value}
      </Text>
    </View>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.infoCard}>{children}</View>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline
// ─────────────────────────────────────────────────────────────────────────────

function Timeline({ currentIndex }: { currentIndex: number }) {
  return (
    <View style={styles.timeline}>
      {LIFECYCLE_STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isFuture = i > currentIndex;

        const dotColor = isDone
          ? COLORS.accentGreen
          : isCurrent
          ? COLORS.primary
          : COLORS.border;
        const lineColor = isDone ? COLORS.accentGreen : COLORS.border;
        const textColor = isCurrent
          ? COLORS.text
          : isDone
          ? COLORS.accentGreen
          : COLORS.textMuted;

        return (
          <View key={step.key} style={styles.timelineRow}>
            {/* Vertical connector */}
            <View style={styles.timelineLeft}>
              {i > 0 ? (
                <View style={[styles.timelineLine, { backgroundColor: lineColor }]} />
              ) : (
                <View style={styles.timelineLineGhost} />
              )}
              <View
                style={[
                  styles.timelineDot,
                  {
                    backgroundColor: isDone ? dotColor : 'transparent',
                    borderColor: dotColor,
                    borderWidth: isCurrent ? 2.5 : 1.5,
                  },
                ]}
              >
                {isDone ? (
                  <Text style={styles.timelineCheck}>✓</Text>
                ) : isCurrent ? (
                  <View style={styles.timelineDotInner} />
                ) : null}
              </View>
              {i < LIFECYCLE_STEPS.length - 1 ? (
                <View
                  style={[
                    styles.timelineLineBottom,
                    { backgroundColor: isDone ? COLORS.accentGreen : COLORS.border },
                  ]}
                />
              ) : (
                <View style={styles.timelineLineGhost} />
              )}
            </View>

            {/* Label */}
            <View style={styles.timelineRight}>
              <Text
                style={[
                  styles.timelineLabel,
                  { color: textColor },
                  isCurrent && styles.timelineLabelCurrent,
                ]}
              >
                {step.label}
              </Text>
              {isCurrent && (
                <View style={styles.timelinePill}>
                  <Text style={styles.timelinePillText}>Current</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Map (native via SafeMap)
// ─────────────────────────────────────────────────────────────────────────────

let SafeMap: React.ComponentType<any> | null = null;
let Marker: React.ComponentType<any> | null = null;

try {
  const m = require('@/components/SafeMap');
  SafeMap = m.default;
  Marker = m.Marker;
} catch {
  // Not available in this build
}

function AdminOrderMap({ order }: { order: AdminEmoOrder }) {
  const hasRestaurant =
    typeof order.restaurantLat === 'number' &&
    typeof order.restaurantLng === 'number';
  const hasDelivery =
    typeof order.deliveryLat === 'number' &&
    typeof order.deliveryLng === 'number';

  if (!SafeMap || !Marker || (!hasRestaurant && !hasDelivery)) {
    if (order.googleMapsUrl) {
      return (
        <TouchableOpacity
          style={styles.mapFallback}
          onPress={() => Linking.openURL(order.googleMapsUrl!)}
        >
          <Text style={styles.mapFallbackIcon}>🗺</Text>
          <Text style={styles.mapFallbackText}>Open in Google Maps</Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.mapFallback}>
        <Text style={styles.mapFallbackText}>Map unavailable — no coordinates</Text>
      </View>
    );
  }

  const lat = hasRestaurant ? order.restaurantLat! : order.deliveryLat!;
  const lng = hasRestaurant ? order.restaurantLng! : order.deliveryLng!;

  const latDelta = hasRestaurant && hasDelivery
    ? Math.abs(order.restaurantLat! - order.deliveryLat!) * 2 + 0.01
    : 0.02;
  const lngDelta = hasRestaurant && hasDelivery
    ? Math.abs(order.restaurantLng! - order.deliveryLng!) * 2 + 0.01
    : 0.02;

  const centerLat = hasRestaurant && hasDelivery
    ? (order.restaurantLat! + order.deliveryLat!) / 2
    : lat;
  const centerLng = hasRestaurant && hasDelivery
    ? (order.restaurantLng! + order.deliveryLng!) / 2
    : lng;

  return (
    <View style={styles.mapContainer}>
      <SafeMap
        style={styles.map}
        initialRegion={{
          latitude: centerLat,
          longitude: centerLng,
          latitudeDelta: Math.max(latDelta, 0.01),
          longitudeDelta: Math.max(lngDelta, 0.01),
        }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
      >
        {hasRestaurant && Marker ? (
          <Marker
            coordinate={{ latitude: order.restaurantLat!, longitude: order.restaurantLng! }}
            title={order.restaurantName}
            description="Restaurant"
            pinColor="#A855F7"
          />
        ) : null}
        {hasDelivery && Marker ? (
          <Marker
            coordinate={{ latitude: order.deliveryLat!, longitude: order.deliveryLng! }}
            title="Delivery Address"
            description={order.deliveryAddress ?? ''}
            pinColor="#22C55E"
          />
        ) : null}
      </SafeMap>
      <View style={styles.mapLegend}>
        <View style={styles.mapLegendItem}>
          <View style={[styles.mapLegendDot, { backgroundColor: '#A855F7' }]} />
          <Text style={styles.mapLegendLabel}>Restaurant</Text>
        </View>
        <View style={styles.mapLegendItem}>
          <View style={[styles.mapLegendDot, { backgroundColor: '#22C55E' }]} />
          <Text style={styles.mapLegendLabel}>Delivery</Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin actions
// ─────────────────────────────────────────────────────────────────────────────

function AdminActions({ order, onRefresh }: { order: AdminEmoOrder; onRefresh: () => void }) {
  const openStripe = () => {
    if (!order.stripePaymentIntentId) {
      Alert.alert('No Stripe Intent', 'This order has no Stripe payment intent ID.');
      return;
    }
    const stripeUrl = `https://dashboard.stripe.com/payments/${order.stripePaymentIntentId}`;
    Linking.openURL(stripeUrl);
  };

  const openMaps = () => {
    if (!order.googleMapsUrl) {
      Alert.alert('No Maps URL', 'No Google Maps link available for this restaurant.');
      return;
    }
    Linking.openURL(order.googleMapsUrl);
  };

  const showTimestamps = () => {
    const lines = [
      `Created: ${formatEmoTs(order.createdAtMs)}`,
      `Updated: ${formatEmoTs(order.updatedAtMs)}`,
      `Accepted: ${formatEmoTs(order.acceptedAtMs)}`,
      `Prepared: ${formatEmoTs(order.preparedAtMs)}`,
      `Picked Up: ${formatEmoTs(order.pickedUpAtMs)}`,
      `Delivered: ${formatEmoTs(order.deliveredAtMs)}`,
    ].join('\n');
    Alert.alert('Timestamps', lines);
  };

  const showFirestoreInfo = () => {
    Alert.alert(
      'Firestore Info',
      `Collection: orders\nDocument ID: ${order.id}\nOrder Source: ${order.orderSource}\nType: ${order.type ?? '—'}`,
    );
  };

  return (
    <View style={styles.actionsRow}>
      <TouchableOpacity style={styles.actionBtn} onPress={onRefresh}>
        <Text style={styles.actionBtnText}>↻ Refresh</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionBtn} onPress={showTimestamps}>
        <Text style={styles.actionBtnText}>⏱ Timestamps</Text>
      </TouchableOpacity>
      {order.stripePaymentIntentId ? (
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnStripe]} onPress={openStripe}>
          <Text style={styles.actionBtnText}>Stripe ↗</Text>
        </TouchableOpacity>
      ) : null}
      {order.googleMapsUrl ? (
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnMaps]} onPress={openMaps}>
          <Text style={styles.actionBtnText}>Maps ↗</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={styles.actionBtn} onPress={showFirestoreInfo}>
        <Text style={styles.actionBtnText}>Firestore</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminEmoOrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, firestoreUserRole } = useAuth();

  const [order, setOrder] = useState<AdminEmoOrder | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const isAdmin = isAdminUser(user, firestoreUserRole);

  const orderId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

  useEffect(() => {
    if (!isAdmin || !orderId) return;
    const unsub = subscribeEmoOrder(
      orderId,
      (data) => {
        setOrder(data);
        setReady(true);
      },
      () => setReady(true),
    );
    return () => unsub();
  }, [isAdmin, orderId, refreshKey]);

  const currentLifecycleIndex = useMemo(
    () => (order ? resolveLifecycleIndex(order) : 0),
    [order],
  );

  const statusColor = order
    ? emoOrderStatusColor(order.status, {
        accentGreen: COLORS.accentGreen,
        accentAmber: COLORS.accentAmber,
        accentRed: COLORS.error,
        primary: COLORS.primary,
        meta: COLORS.textMuted,
      })
    : COLORS.textMuted;

  if (!ready) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AdminHeader
          title="Order Detail"
          fallbackRoute={adminRoutes.emoOrders}
        />
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AdminHeader
          title="Order Detail"
          fallbackRoute={adminRoutes.emoOrders}
        />
        <View style={styles.loading}>
          <Text style={styles.notFound}>Order not found or not an Emo AI order.</Text>
          <TouchableOpacity
            style={[styles.actionBtn, { marginTop: 16 }]}
            onPress={() => router.replace(adminRoutes.emoOrders as never)}
          >
            <Text style={styles.actionBtnText}>← Back to list</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader
        title={`Order #${order.id.slice(-8).toUpperCase()}`}
        subtitle={formatEmoOrderStatus(order.status)}
        fallbackRoute={adminRoutes.emoOrders}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status badge ── */}
        <View style={styles.statusBar}>
          <View style={[styles.statusBadge, { borderColor: statusColor }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {formatEmoOrderStatus(order.status)}
            </Text>
          </View>
          {order.paymentStatus === 'paid' || order.paymentStatus === 'succeeded' ? (
            <View style={[styles.statusBadge, { borderColor: COLORS.accentGreen }]}>
              <Text style={[styles.statusBadgeText, { color: COLORS.accentGreen }]}>✓ Paid</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, { borderColor: COLORS.accentAmber }]}>
              <Text style={[styles.statusBadgeText, { color: COLORS.accentAmber }]}>Unpaid</Text>
            </View>
          )}
          <Text style={styles.statusTotal}>${order.total.toFixed(2)}</Text>
        </View>

        {/* ── Admin actions ── */}
        <AdminActions order={order} onRefresh={() => setRefreshKey((k) => k + 1)} />

        {/* ── Customer ── */}
        <SectionTitle title="Customer" />
        <InfoCard>
          <InfoRow label="Name" value={order.customerName ?? order.customerId.slice(0, 16)} />
          <InfoRow label="Email" value={order.customerEmail} />
          <InfoRow label="Phone" value={order.customerPhone} />
          <InfoRow label="Delivery Address" value={order.deliveryAddress} />
          <InfoRow label="City" value={order.city} />
          <InfoRow label="Customer ID" value={order.customerId} mono />
        </InfoCard>

        {/* ── Restaurant ── */}
        <SectionTitle title="Restaurant" />
        <InfoCard>
          <InfoRow label="Name" value={order.restaurantName} />
          <InfoRow label="Address" value={order.restaurantAddress} />
          <InfoRow label="Google Place ID" value={order.restaurantId?.startsWith('i_want_')
            ? order.restaurantId.replace('i_want_', '')
            : order.restaurantId} mono />
          <InfoRow label="Coordinates"
            value={
              order.restaurantLat != null && order.restaurantLng != null
                ? `${order.restaurantLat.toFixed(6)}, ${order.restaurantLng.toFixed(6)}`
                : null
            }
          />
          {order.googleMapsUrl ? (
            <TouchableOpacity
              style={styles.linkBtn}
              onPress={() => Linking.openURL(order.googleMapsUrl!)}
            >
              <Text style={styles.linkBtnText}>Open in Google Maps ↗</Text>
            </TouchableOpacity>
          ) : null}
        </InfoCard>

        {/* ── Meal ── */}
        <SectionTitle title="Meal" />
        <InfoCard>
          <InfoRow label="Meal Name" value={order.mealName} />
          <InfoRow label="Unit Price" value={`$${order.estimatedMealPrice.toFixed(2)}`} />
          <InfoRow label="Quantity" value={String(order.quantity)} />
          <InfoRow label="Notes" value={order.mealNotes} />
        </InfoCard>

        {/* ── Payment ── */}
        <SectionTitle title="Payment" />
        <InfoCard>
          <InfoRow label="Status" value={order.paymentStatus} />
          <InfoRow label="Subtotal" value={`$${order.subtotal.toFixed(2)}`} />
          <InfoRow label="Delivery Fee" value={`$${order.deliveryFee.toFixed(2)}`} />
          <InfoRow label="Service Fee" value={`$${order.serviceFee.toFixed(2)}`} />
          <InfoRow label="Tax (HST)" value={`$${order.tax.toFixed(2)}`} />
          <InfoRow label="Total" value={`$${order.total.toFixed(2)}`} />
          <InfoRow label="Receipt #" value={order.receiptNumber} mono />
          <InfoRow label="Stripe Intent ID" value={order.stripePaymentIntentId} mono />
          <InfoRow label="Checkout Session" value={order.checkoutSessionId} mono />
        </InfoCard>

        {/* ── Driver ── */}
        <SectionTitle title="Driver" />
        <InfoCard>
          {order.driverId ? (
            <>
              <InfoRow label="Driver ID" value={order.driverId} mono />
              <InfoRow label="Name" value={order.driverName} />
              <InfoRow label="Phone" value={order.driverPhone} />
              <InfoRow label="Vehicle" value={order.driverVehicle} />
              <InfoRow label="Driver Status" value={order.deliveryStatus} />
              <InfoRow label="Accepted At" value={formatEmoTs(order.acceptedAtMs)} />
              <InfoRow label="Picked Up At" value={formatEmoTs(order.pickedUpAtMs)} />
              <InfoRow label="Delivered At" value={formatEmoTs(order.deliveredAtMs)} />
            </>
          ) : (
            <Text style={styles.noDriver}>No driver assigned yet</Text>
          )}
        </InfoCard>

        {/* ── Timestamps ── */}
        <SectionTitle title="Timestamps" />
        <InfoCard>
          <InfoRow label="Created" value={formatEmoTs(order.createdAtMs)} />
          <InfoRow label="Last Updated" value={formatEmoTs(order.updatedAtMs)} />
          <InfoRow label="Accepted" value={formatEmoTs(order.acceptedAtMs)} />
          <InfoRow label="Prepared" value={formatEmoTs(order.preparedAtMs)} />
          <InfoRow label="Picked Up" value={formatEmoTs(order.pickedUpAtMs)} />
          <InfoRow label="Delivered" value={formatEmoTs(order.deliveredAtMs)} />
        </InfoCard>

        {/* ── Order lifecycle timeline ── */}
        <SectionTitle title="Order Lifecycle" />
        <View style={styles.timelineCard}>
          <Timeline currentIndex={currentLifecycleIndex} />
        </View>

        {/* ── Map ── */}
        <SectionTitle title="Map" />
        <View style={styles.mapCard}>
          <AdminOrderMap order={order} />
        </View>

        {/* ── Firestore metadata ── */}
        <SectionTitle title="Metadata" />
        <InfoCard>
          <InfoRow label="Order ID" value={order.id} mono />
          <InfoRow label="Order Source" value={order.orderSource} mono />
          <InfoRow label="Type" value={order.type} mono />
          <InfoRow label="Restaurant ID" value={order.restaurantId} mono />
        </InfoCard>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingTop: 8 },

  // Status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  statusBadgeText: { fontSize: 13, fontWeight: '700' },
  statusTotal: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginLeft: 'auto' },

  // Admin actions
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionBtnStripe: { borderColor: COLORS.primary },
  actionBtnMaps: { borderColor: COLORS.accentBlue },
  actionBtnText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },

  // Sections
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: COLORS.textMuted,
    marginTop: 18,
    marginBottom: 6,
  },
  infoCard: {
    ...adminCardShell,
    gap: 10,
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    flexShrink: 0,
    maxWidth: '38%',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
    textAlign: 'right',
  },
  infoMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: COLORS.primary,
  },
  linkBtn: {
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accentBlue,
  },
  noDriver: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Timeline
  timelineCard: {
    ...adminCardShell,
    paddingVertical: 8,
    marginBottom: 2,
  },
  timeline: { paddingLeft: 8 },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 36,
  },
  timelineLeft: {
    width: 28,
    alignItems: 'center',
  },
  timelineLine: {
    width: 2,
    height: 8,
    borderRadius: 1,
  },
  timelineLineBottom: {
    width: 2,
    flex: 1,
    borderRadius: 1,
    minHeight: 8,
  },
  timelineLineGhost: {
    width: 2,
    height: 8,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  timelineCheck: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
  },
  timelineRight: {
    flex: 1,
    paddingLeft: 10,
    justifyContent: 'center',
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timelineLabel: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  timelineLabelCurrent: { fontWeight: '700' },
  timelinePill: {
    backgroundColor: COLORS.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  timelinePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Map
  mapCard: {
    ...adminCardShell,
    padding: 0,
    overflow: 'hidden',
    marginBottom: 2,
  },
  mapContainer: { borderRadius: 20, overflow: 'hidden' },
  map: { width: '100%', height: 220 },
  mapLegend: {
    flexDirection: 'row',
    gap: 16,
    padding: 10,
    backgroundColor: COLORS.card,
  },
  mapLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mapLegendDot: { width: 10, height: 10, borderRadius: 5 },
  mapLegendLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  mapFallback: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mapFallbackIcon: { fontSize: 28 },
  mapFallbackText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },

  // Loading / error states
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { color: COLORS.textMuted, fontSize: 16, fontWeight: '600' },
});
