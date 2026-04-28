import { DriverInfoCard } from '@/components/delivery/DriverInfoCard';
import { StatusProgressBar } from '@/components/delivery/StatusProgressBar';
import {
  deriveTrackingStatus,
  getOrderSummary,
  subscribeDeliveryByOrderId,
  subscribeDriver,
  type DeliveryDoc,
  type DeliveryStatus,
  type DriverDoc,
  type OrderSummary,
} from '@/services/deliveryTracking';
import { showNotice } from '@/utils/toast';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUS_COPY: Record<DeliveryStatus, { title: string; subtitle: string }> = {
  waiting: {
    title: 'Waiting for match',
    subtitle: 'Looking for more people to complete this shared order.',
  },
  matched: {
    title: 'Order matched',
    subtitle: 'Restaurant has started processing your order.',
  },
  preparing: {
    title: 'Food is being prepared',
    subtitle: 'Kitchen is preparing your meal now.',
  },
  picked_up: {
    title: 'Picked up',
    subtitle: 'Driver has collected your order.',
  },
  on_the_way: {
    title: 'Your order is on the way',
    subtitle: 'Driver is heading to your location.',
  },
  delivered: {
    title: 'Delivered',
    subtitle: 'Enjoy your meal. Thanks for sharing with HalfOrder.',
  },
};

function statusColor(status: DeliveryStatus): string {
  if (status === 'preparing') return '#F59E0B';
  if (status === 'on_the_way') return '#2563EB';
  if (status === 'delivered') return '#16A34A';
  return '#334155';
}

export default function DeliveryTrackingScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [delivery, setDelivery] = useState<DeliveryDoc | null>(null);
  const [driver, setDriver] = useState<DriverDoc | null>(null);
  const prevStatusRef = useRef<DeliveryStatus | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let mounted = true;
    getOrderSummary(orderId)
      .then((s) => {
        if (!mounted) return;
        setSummary(s);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSummary(null);
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    const unsubDelivery = subscribeDeliveryByOrderId(orderId, setDelivery);
    return () => unsubDelivery();
  }, [orderId]);

  useEffect(() => {
    if (!delivery?.driverId) {
      setDriver(null);
      return;
    }
    const unsubDriver = subscribeDriver(delivery.driverId, setDriver);
    return () => unsubDriver();
  }, [delivery?.driverId]);

  const trackingStatus = useMemo(() => {
    if (!summary) return 'waiting' as DeliveryStatus;
    return deriveTrackingStatus(summary.status, delivery?.status ?? null);
  }, [delivery?.status, summary]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (!prev || prev === trackingStatus) {
      prevStatusRef.current = trackingStatus;
      return;
    }
    prevStatusRef.current = trackingStatus;
    showNotice('Delivery update', STATUS_COPY[trackingStatus].title);
  }, [trackingStatus]);

  const etaText =
    trackingStatus === 'on_the_way'
      ? `Arriving in ${Math.max(1, delivery?.eta ?? 12)} mins`
      : trackingStatus === 'preparing'
        ? 'Food is being prepared'
        : trackingStatus === 'delivered'
          ? 'Delivered'
          : `ETA ${Math.max(5, delivery?.eta ?? 15)} mins`;

  const restaurantPoint = summary?.restaurantLocation;
  const userPoint = summary?.userLocation;
  const driverPoint = delivery?.driverLocation ?? driver?.currentLocation ?? null;

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  if (!summary) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.empty}>Delivery not found for this order.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.mapWrap}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={{
            latitude: driverPoint?.lat ?? restaurantPoint?.lat ?? 43.6532,
            longitude: driverPoint?.lng ?? restaurantPoint?.lng ?? -79.3832,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          }}
        >
          {restaurantPoint ? (
            <Marker
              coordinate={{
                latitude: restaurantPoint.lat,
                longitude: restaurantPoint.lng,
              }}
              title={summary.restaurantName}
              description="Restaurant"
              pinColor="#F59E0B"
            />
          ) : null}
          {driverPoint ? (
            <Marker
              coordinate={{ latitude: driverPoint.lat, longitude: driverPoint.lng }}
              title={driver?.name ?? 'Driver'}
              description="Driver"
              pinColor="#2563EB"
            />
          ) : null}
          {userPoint ? (
            <Marker
              coordinate={{ latitude: userPoint.lat, longitude: userPoint.lng }}
              title="You"
              description="Delivery location"
              pinColor="#16A34A"
            />
          ) : null}
          {driverPoint && userPoint ? (
            <Polyline
              coordinates={[
                { latitude: driverPoint.lat, longitude: driverPoint.lng },
                { latitude: userPoint.lat, longitude: userPoint.lng },
              ]}
              strokeWidth={4}
              strokeColor="#60A5FA"
            />
          ) : null}
        </MapView>
      </View>

      <View style={styles.bottomSheet}>
        <View style={styles.statusCard}>
          <Text style={[styles.statusTitle, { color: statusColor(trackingStatus) }]}>
            {STATUS_COPY[trackingStatus].title}
          </Text>
          <Text style={styles.statusSub}>{etaText}</Text>
          <Text style={styles.statusBody}>{STATUS_COPY[trackingStatus].subtitle}</Text>
          <View style={{ marginTop: 12 }}>
            <StatusProgressBar status={trackingStatus} />
          </View>
        </View>

        <DriverInfoCard
          driver={driver}
          onCallPress={() => showNotice('Call driver', 'Calling is mocked in MVP mode.')}
        />

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          <Text style={styles.summaryLine}>{summary.mealName}</Text>
          <Text style={styles.summaryMeta}>Shared with {summary.usersCount} users</Text>
          <Text style={styles.summaryMeta}>
            Pickup: {summary.restaurantName} · {summary.restaurantLocationText}
          </Text>
          <Pressable
            style={styles.secondaryAction}
            onPress={() => showNotice('Tracking', 'Live updates are enabled in real-time.')}
          >
            <Text style={styles.secondaryActionText}>Refresh status</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F1F5F9' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#64748B', fontSize: 15, fontWeight: '600' },
  mapWrap: {
    height: '50%',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  bottomSheet: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  statusTitle: { fontSize: 24, fontWeight: '800' },
  statusSub: { marginTop: 4, color: '#1E293B', fontSize: 16, fontWeight: '700' },
  statusBody: { marginTop: 6, color: '#64748B', fontSize: 13, lineHeight: 18 },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
  },
  summaryTitle: { color: '#0F172A', fontSize: 17, fontWeight: '800' },
  summaryLine: { marginTop: 8, color: '#0F172A', fontSize: 15, fontWeight: '700' },
  summaryMeta: { marginTop: 4, color: '#64748B', fontSize: 13, fontWeight: '600' },
  secondaryAction: {
    marginTop: 10,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: { color: '#334155', fontWeight: '700' },
});
