import { LiveDeliveryMap } from '@/components/logistics/LiveDeliveryMap';
import type { MapCoord } from '@/components/logistics/liveDeliveryMapTypes';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { DriverVehicleInfoCard } from '@/components/delivery/DriverVehicleInfoCard';
import { adminCardShell, adminColors as COLORS, adminFontFamily } from '@/constants/adminTheme';
import { isAdminUser } from '@/constants/adminUid';
import { haversineDistanceKm } from '@/lib/haversine';
import {
  EMPTY_DRIVER_VEHICLE,
  pickDriverVehicleFromDocs,
  type DriverVehicleInfo,
} from '@/lib/driverVehicle';
import { isTrustedDriverProfilePhotoUrl } from '@/lib/driverProfileIdentity';
import { parseLegacyLatLng } from '@/lib/location/coordinates';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type LiveAdminOrder = {
  id: string;
  restaurantName: string;
  customerName: string;
  driverId: string | null;
  driverName: string;
  driverPhone: string | null;
  driverPhotoURL: string | null;
  vehicle: DriverVehicleInfo;
  status: string;
  deliveryStatus: string;
  paymentStatus: string;
  deliveryType: string;
  totalLabel: string;
  etaLabel: string;
  distanceLabel: string;
  restaurant: MapCoord | null;
  customer: MapCoord | null;
  driver: MapCoord | null;
  driverHeading: number | null;
  polyline: MapCoord[];
  updatedAtMs: number;
};

const ACTIVE_HINT =
  /deliver|pickup|prepar|assign|accepted|out_for|en_route|on_the_way|ready|transit|active|confirmed|paid/i;

function pickString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function moneyLabel(data: Record<string, unknown>): string {
  const cents =
    typeof data.amountTotal === 'number'
      ? data.amountTotal
      : typeof data.totalCents === 'number'
        ? data.totalCents
        : null;
  if (cents != null && Number.isFinite(cents)) {
    return `$${(cents / 100).toFixed(2)}`;
  }
  const dollars =
    typeof data.totalPrice === 'number'
      ? data.totalPrice
      : typeof data.total === 'number'
        ? data.total
        : typeof data.price === 'number'
          ? data.price
          : null;
  if (dollars != null && Number.isFinite(dollars)) {
    return `$${dollars.toFixed(2)}`;
  }
  return '—';
}

function toMapCoord(value: unknown): MapCoord | null {
  const p = parseLegacyLatLng(value);
  if (!p) return null;
  return { latitude: p.lat, longitude: p.lng };
}

function nest(data: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = data[key];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function mapLiveOrder(id: string, data: Record<string, unknown>): LiveAdminOrder | null {
  const restaurant =
    toMapCoord(data.restaurantLocation) ??
    toMapCoord(nest(data, 'restaurant')?.location) ??
    toMapCoord(nest(data, 'restaurant')?.coordinates);
  const customer =
    toMapCoord(data.customerLocation) ??
    toMapCoord(data.dropoffLocation) ??
    toMapCoord(data.deliveryLocation) ??
    toMapCoord(nest(data, 'customer')?.location);
  const driverRaw = data.driverLocation;
  const driverParsed = parseLegacyLatLng(driverRaw);
  const driver = driverParsed
    ? { latitude: driverParsed.lat, longitude: driverParsed.lng }
    : null;

  if (!restaurant && !customer && !driver) return null;

  const status = pickString(data.status) ?? '—';
  const deliveryStatus =
    pickString(data.deliveryStatus, data.marketplaceDeliveryStatus, data.courierStatus) ??
    status;
  const combined = `${status} ${deliveryStatus}`;
  if (!ACTIVE_HINT.test(combined) && !driver) {
    // Still show if there is a live driver ping; otherwise skip completed noise.
    if (/deliver(ed)?|cancel|complete|refund/i.test(combined) && !driver) {
      return null;
    }
  }

  const restaurantName =
    pickString(
      nest(data, 'restaurant')?.name,
      data.restaurantName,
      data.restaurant,
    ) ?? 'Restaurant';
  const customerName =
    pickString(
      nest(data, 'customer')?.name,
      nest(data, 'customer')?.displayName,
      data.customerName,
      nest(data, 'user')?.displayName,
      data.userName,
    ) ?? 'Customer';
  const driverName =
    pickString(
      data.driverName,
      nest(data, 'driver')?.name,
      nest(data, 'driver')?.displayName,
    ) ?? (driver ? 'Driver' : 'Unassigned');

  const driverId =
    pickString(data.driverId, data.assignedDriverId, nest(data, 'driver')?.id) ??
    null;

  const driverPhone =
    pickString(data.driverPhone, nest(data, 'driver')?.phone) ?? null;

  const driverPhotoURL = (() => {
    const url = pickString(
      nest(data, 'driver')?.avatar,
      nest(data, 'driver')?.photoURL,
      data.driverPhotoURL,
    );
    return url && isTrustedDriverProfilePhotoUrl(url) ? url : null;
  })();

  const driverNest = nest(data, 'driver');
  const vehicle: DriverVehicleInfo = {
    vehiclePhoto: pickString(driverNest?.vehiclePhoto, data.vehiclePhoto),
    vehicleMake: pickString(driverNest?.vehicleMake, data.vehicleMake),
    vehicleModel: pickString(driverNest?.vehicleModel, data.vehicleModel),
    vehicleYear: pickString(driverNest?.vehicleYear, data.vehicleYear),
    vehicleColor: pickString(driverNest?.vehicleColor, data.vehicleColor),
    licensePlate: pickString(driverNest?.licensePlate, data.licensePlate),
  };

  const paymentStatus =
    pickString(
      data.paymentStatus,
      data.payment_state,
      nest(data, 'payment')?.status,
    ) ?? '—';

  const deliveryType =
    pickString(data.fulfillmentType, data.deliveryType, data.orderType, data.mode) ??
    'Delivery';

  let distanceKm: number | null = null;
  if (restaurant && customer) {
    distanceKm = haversineDistanceKm(
      restaurant.latitude,
      restaurant.longitude,
      customer.latitude,
      customer.longitude,
    );
  } else if (driver && customer) {
    distanceKm = haversineDistanceKm(
      driver.latitude,
      driver.longitude,
      customer.latitude,
      customer.longitude,
    );
  }

  const etaMin =
    typeof data.estimatedDurationMin === 'number'
      ? data.estimatedDurationMin
      : typeof data.etaMinutes === 'number'
        ? data.etaMinutes
        : null;

  const polyline: MapCoord[] = [];
  if (restaurant) polyline.push(restaurant);
  if (driver) polyline.push(driver);
  if (customer) polyline.push(customer);

  const updatedAt =
    typeof (data.updatedAt as { toMillis?: () => number } | undefined)?.toMillis ===
    'function'
      ? (data.updatedAt as { toMillis: () => number }).toMillis()
      : Date.now();

  return {
    id,
    restaurantName,
    customerName,
    driverId,
    driverName,
    driverPhone,
    driverPhotoURL,
    vehicle,
    status,
    deliveryStatus,
    paymentStatus,
    deliveryType,
    totalLabel: moneyLabel(data),
    etaLabel: etaMin != null && Number.isFinite(etaMin) ? `${Math.round(etaMin)} min` : '—',
    distanceLabel:
      distanceKm != null && Number.isFinite(distanceKm)
        ? distanceKm < 0.1
          ? '< 0.1 km'
          : `${distanceKm.toFixed(1)} km`
        : '—',
    restaurant,
    customer,
    driver,
    driverHeading: driverParsed?.heading ?? null,
    polyline,
    updatedAtMs: updatedAt,
  };
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaLabelWrap}>
        <Ionicons name={icon} size={14} color={COLORS.textMuted} />
        <Text style={styles.metaLabel}>{label}</Text>
      </View>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function AdminLiveOrderMapScreen() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();
  const [orders, setOrders] = useState<LiveAdminOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveDriverName, setLiveDriverName] = useState<string | null>(null);
  const [liveDriverPhone, setLiveDriverPhone] = useState<string | null>(null);
  const [liveDriverPhoto, setLiveDriverPhoto] = useState<string | null>(null);
  const [liveVehicle, setLiveVehicle] = useState<DriverVehicleInfo>({
    ...EMPTY_DRIVER_VEHICLE,
  });

  const isAdmin = isAdminUser(user, firestoreUserRole);

  useEffect(() => {
    if (!user || !isAdminUser(user, firestoreUserRole)) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const next: LiveAdminOrder[] = [];
        snap.docs.forEach((d) => {
          const mapped = mapLiveOrder(d.id, d.data() as Record<string, unknown>);
          if (mapped) next.push(mapped);
        });
        next.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        setOrders(next);
        setSelectedId((prev) =>
          prev && next.some((o) => o.id === prev) ? prev : null,
        );
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(getReadableErrorMessageOr(err, 'Failed to load live orders'));
        setOrders([]);
        setLoading(false);
      },
    );
    return unsub;
  }, [user, firestoreUserRole]);

  const selected = useMemo(
    () => (selectedId ? orders.find((o) => o.id === selectedId) ?? null : null),
    [orders, selectedId],
  );

  useEffect(() => {
    const driverId = selected?.driverId ?? null;
    if (!driverId || !selected) {
      setLiveDriverName(null);
      setLiveDriverPhone(null);
      setLiveDriverPhoto(null);
      setLiveVehicle({ ...EMPTY_DRIVER_VEHICLE });
      return;
    }

    // Seed from order snapshot, then prefer live drivers/{uid} profile.
    setLiveDriverName(selected.driverName);
    setLiveDriverPhone(selected.driverPhone);
    setLiveDriverPhoto(selected.driverPhotoURL);
    setLiveVehicle(selected.vehicle);

    const unsub = onSnapshot(
      doc(db, 'drivers', driverId),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        const name = pickString(data.name, data.displayName);
        if (name) setLiveDriverName(name);
        const phone = pickString(data.phone, data.phoneNumber);
        if (phone) setLiveDriverPhone(phone);
        const photo = pickString(data.photoURL, data.avatar, data.photo);
        if (photo && isTrustedDriverProfilePhotoUrl(photo)) {
          setLiveDriverPhoto(photo);
        }
        setLiveVehicle(pickDriverVehicleFromDocs(null, data));
      },
      () => {
        // Keep order-stamped vehicle if live read fails.
      },
    );
    return unsub;
  }, [selectedId, selected?.driverId]);

  function formatOrderTime(ms: number): string {
    if (!Number.isFinite(ms)) return '—';
    return new Date(ms).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (!user || !isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.unauthorized}>You are not authorized</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <AdminHeader title="Live Map" subtitle="Monitoring deliveries…" />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Syncing live deliveries…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!selected) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <AdminHeader
          title="Live Map"
          subtitle={`${orders.length} active ${orders.length === 1 ? 'delivery' : 'deliveries'} · tap to track`}
        />
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {orders.length === 0 ? (
            <View style={styles.emptyList}>
              <Ionicons name="navigate-outline" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyListText}>
                No active deliveries with live locations right now.
              </Text>
            </View>
          ) : (
            orders.map((o) => (
              <Pressable
                key={o.id}
                style={({ pressed }) => [styles.orderCard, pressed && styles.orderCardPressed]}
                onPress={() => setSelectedId(o.id)}
              >
                <View style={styles.orderCardHeader}>
                  <Text style={styles.orderId}>#{o.id.slice(0, 12)}</Text>
                  <View style={styles.statusChip}>
                    <Text style={styles.statusChipText} numberOfLines={1}>
                      {o.deliveryStatus}
                    </Text>
                  </View>
                </View>
                <MetaRow icon="person-outline" label="Customer" value={o.customerName} />
                <MetaRow icon="restaurant-outline" label="Restaurant" value={o.restaurantName} />
                <MetaRow icon="car-outline" label="Driver" value={o.driverName} />
                <MetaRow icon="flag-outline" label="Status" value={o.status} />
                <MetaRow
                  icon="time-outline"
                  label="Time"
                  value={formatOrderTime(o.updatedAtMs)}
                />
                <View style={styles.openTrackRow}>
                  <Text style={styles.openTrackText}>Open live tracking</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <AdminHeader
        title="Live tracking"
        subtitle={`Order #${selected.id.slice(0, 12)}`}
      />
      <Pressable style={styles.backToList} onPress={() => setSelectedId(null)}>
        <Ionicons name="list-outline" size={16} color={COLORS.primary} />
        <Text style={styles.backToListText}>All active deliveries</Text>
      </Pressable>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.mapShell}>
        {Platform.OS === 'web' ? (
          <View style={styles.webPlaceholder}>
            <Ionicons name="map-outline" size={36} color={COLORS.primary} />
            <Text style={styles.webPlaceholderText}>
              Live delivery map is available on iOS and Android.
            </Text>
          </View>
        ) : (
          <LiveDeliveryMap
            polylineCoords={selected.polyline}
            restaurant={selected.restaurant}
            dropoff={selected.customer}
            driver={selected.driver}
            driverHeading={selected.driverHeading}
            dark
          />
        )}

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#A855F7' }]} />
            <Text style={styles.legendText}>Restaurant</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#38BDF8' }]} />
            <Text style={styles.legendText}>Customer</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.legendText}>Driver</Text>
          </View>
        </View>
      </View>

      <View style={styles.floatingCard}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardKicker}>Active delivery</Text>
            <Text style={styles.cardOrderId}>#{selected.id.slice(0, 12)}</Text>
          </View>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{selected.deliveryStatus}</Text>
          </View>
        </View>

        <MetaRow icon="restaurant-outline" label="Restaurant" value={selected.restaurantName} />
        <MetaRow icon="person-outline" label="Customer" value={selected.customerName} />
        <MetaRow icon="cash-outline" label="Order total" value={selected.totalLabel} />
        <MetaRow icon="card-outline" label="Payment" value={selected.paymentStatus} />
        <MetaRow icon="bicycle-outline" label="Type" value={selected.deliveryType} />

        {selected.driverId ? (
          <View style={styles.driverVehicleWrap}>
            <DriverVehicleInfoCard
              heading="Driver & vehicle"
              driverName={liveDriverName || selected.driverName}
              driverPhotoURL={liveDriverPhoto || selected.driverPhotoURL}
              driverPhone={liveDriverPhone || selected.driverPhone}
              vehicle={liveVehicle}
              showPhone
              dark
            />
          </View>
        ) : (
          <MetaRow icon="car-outline" label="Driver" value={selected.driverName} />
        )}

        <View style={styles.metricsRow}>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>ETA</Text>
            <Text style={styles.metricValue}>{selected.etaLabel}</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>{selected.distanceLabel}</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>Status</Text>
            <Text style={styles.metricValue} numberOfLines={1}>
              {selected.status}
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  unauthorized: {
    fontFamily: adminFontFamily,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.error,
    marginBottom: 12,
  },
  backBtn: { padding: 8 },
  backBtnText: {
    fontFamily: adminFontFamily,
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '700',
  },
  loadingText: {
    marginTop: 12,
    fontFamily: adminFontFamily,
    fontSize: 14,
    color: COLORS.textMuted,
  },
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorText: { color: COLORS.error, fontWeight: '700', fontSize: 13 },
  listContent: { padding: 16, paddingBottom: 32, gap: 12 },
  emptyList: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: 12,
  },
  emptyListText: {
    fontFamily: adminFontFamily,
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '600',
    paddingHorizontal: 24,
  },
  orderCard: {
    ...adminCardShell,
    paddingBottom: 12,
  },
  orderCardPressed: { opacity: 0.88 },
  orderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  orderId: {
    fontFamily: adminFontFamily,
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  openTrackRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  openTrackText: {
    fontFamily: adminFontFamily,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  backToList: {
    marginHorizontal: 16,
    marginBottom: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  backToListText: {
    fontFamily: adminFontFamily,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  mapShell: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 280,
  },
  webPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0B0816',
    gap: 12,
  },
  webPlaceholderText: {
    fontFamily: adminFontFamily,
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '600',
  },
  legend: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: 'rgba(9,9,11,0.78)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
  floatingCard: {
    ...adminCardShell,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
    paddingBottom: 14,
  },
  driverVehicleWrap: {
    marginTop: 12,
    marginBottom: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  cardKicker: {
    fontFamily: adminFontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardOrderId: {
    fontFamily: adminFontFamily,
    marginTop: 4,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  statusChip: {
    backgroundColor: COLORS.successBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 140,
  },
  statusChipText: {
    fontFamily: adminFontFamily,
    color: COLORS.successText,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: 12,
  },
  metaLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 110 },
  metaLabel: {
    fontFamily: adminFontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  metaValue: {
    fontFamily: adminFontFamily,
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  metricPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  metricLabel: {
    fontFamily: adminFontFamily,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontFamily: adminFontFamily,
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
});
