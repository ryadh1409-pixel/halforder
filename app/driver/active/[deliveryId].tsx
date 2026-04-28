import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  completeDelivery,
  getCurrentDriverId,
  getOrderRoutePoints,
  subscribeDriverActiveDelivery,
  updateDeliveryStatus,
  updateDriverLocation,
  type DriverDelivery,
} from '@/services/driverSystem';
import { showError, showSuccess } from '@/utils/toast';

export default function ActiveDeliveryScreen() {
  const { deliveryId } = useLocalSearchParams<{ deliveryId: string }>();
  const driverId = getCurrentDriverId();
  const [loading, setLoading] = useState(true);
  const [delivery, setDelivery] = useState<DriverDelivery | null>(null);
  const [restaurantPoint, setRestaurantPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [customerPoint, setCustomerPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [restaurantName, setRestaurantName] = useState('Restaurant');
  const [driverPoint, setDriverPoint] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!driverId) {
      setLoading(false);
      return;
    }
    const unsub = subscribeDriverActiveDelivery(driverId, (row) => {
      setDelivery(row && row.id === deliveryId ? row : null);
      setLoading(false);
    });
    return () => unsub();
  }, [deliveryId, driverId]);

  useEffect(() => {
    if (!delivery?.orderId) return;
    getOrderRoutePoints(delivery.orderId)
      .then((data) => {
        setRestaurantPoint(data.restaurant);
        setCustomerPoint(data.customer);
        setRestaurantName(data.restaurantName);
      })
      .catch(() => {});
  }, [delivery?.orderId]);

  useEffect(() => {
    if (!driverId || !delivery) return;
    let isMounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') return;
      const update = async () => {
        try {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const point = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          if (isMounted) setDriverPoint(point);
          await updateDriverLocation(driverId, point);
        } catch {
          // keep driver flow resilient if location fails briefly
        }
      };
      await update();
      interval = setInterval(() => {
        void update();
      }, 8000);
    };
    void start();
    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [delivery, driverId]);

  const mapRegion = useMemo(
    () => ({
      latitude: driverPoint?.lat ?? restaurantPoint?.lat ?? 43.6532,
      longitude: driverPoint?.lng ?? restaurantPoint?.lng ?? -79.3832,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }),
    [driverPoint?.lat, driverPoint?.lng, restaurantPoint?.lat, restaurantPoint?.lng],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  if (!driverId || !delivery) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.empty}>No active delivery found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.mapWrap}>
        <MapView style={StyleSheet.absoluteFill} initialRegion={mapRegion}>
          {restaurantPoint ? (
            <Marker
              coordinate={{ latitude: restaurantPoint.lat, longitude: restaurantPoint.lng }}
              title={restaurantName}
              pinColor="#F59E0B"
            />
          ) : null}
          {customerPoint ? (
            <Marker
              coordinate={{ latitude: customerPoint.lat, longitude: customerPoint.lng }}
              title="Customer"
              pinColor="#16A34A"
            />
          ) : null}
          {driverPoint ? (
            <Marker
              coordinate={{ latitude: driverPoint.lat, longitude: driverPoint.lng }}
              title="You"
              pinColor="#2563EB"
            />
          ) : null}
          {driverPoint && customerPoint ? (
            <Polyline
              coordinates={[
                { latitude: driverPoint.lat, longitude: driverPoint.lng },
                { latitude: customerPoint.lat, longitude: customerPoint.lng },
              ]}
              strokeWidth={4}
              strokeColor="#60A5FA"
            />
          ) : null}
        </MapView>
      </View>

      <View style={styles.sheet}>
        <Text style={styles.title}>Active Delivery</Text>
        <Text style={styles.meta}>Status: {delivery.status.replace('_', ' ')}</Text>

        <View style={styles.buttonsRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              void updateDeliveryStatus(delivery.id, 'picked_up')
                .then(() => showSuccess('Updated to picked up'))
                .catch(() => showError('Could not update status.'));
            }}
          >
            <Text style={styles.actionText}>Picked Up</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => {
              void updateDeliveryStatus(delivery.id, 'on_the_way')
                .then(() => showSuccess('Updated to on the way'))
                .catch(() => showError('Could not update status.'));
            }}
          >
            <Text style={styles.actionText}>On The Way</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.deliveredBtn}
          onPress={() => {
            void completeDelivery(delivery.id, driverId, delivery.orderId)
              .then(() => showSuccess('Delivery completed'))
              .catch(() => showError('Could not complete delivery.'));
          }}
        >
          <Text style={styles.deliveredText}>Delivered</Text>
        </Pressable>

        <Pressable
          style={styles.navBtn}
          onPress={() => {
            if (!customerPoint) return;
            const url = `https://www.google.com/maps/dir/?api=1&destination=${customerPoint.lat},${customerPoint.lng}`;
            void Linking.openURL(url);
          }}
        >
          <Text style={styles.navText}>Open in Google Maps</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#CBD5E1', fontWeight: '600' },
  mapWrap: { height: '55%', borderBottomLeftRadius: 18, borderBottomRightRadius: 18, overflow: 'hidden' },
  sheet: { flex: 1, padding: 14, gap: 10 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  meta: { color: '#CBD5E1', fontSize: 14, fontWeight: '600' },
  buttonsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, height: 50, borderRadius: 12, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#FFFFFF', fontWeight: '800' },
  deliveredBtn: { height: 52, borderRadius: 12, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' },
  deliveredText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  navBtn: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  navText: { color: '#CBD5E1', fontWeight: '700' },
});
