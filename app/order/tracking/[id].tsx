import { Map, MapMarker } from '@/components/Map';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { getOrderById, useMockDeliveryOrders } from '@/services/mockDeliveryStore';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUS_STEPS = ['Preparing', 'On the way', 'Delivered'] as const;

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  useMockDeliveryOrders();
  const order = useMemo(
    () => (id ? getOrderById(id) : null),
    [id],
  );
  const driver = order?.driver ?? {
    name: 'Ahmed',
    car: 'Toyota Corolla',
    phone: '+1 647 xxx',
    location: { latitude: 43.6532, longitude: -79.3832 },
  };
  const statusLabel =
    order?.status === 'pending'
      ? 'Preparing'
      : order?.status === 'accepted' || order?.status === 'delivering'
        ? 'On the way'
        : 'Delivered';
  const activeStepIndex = useMemo(
    () => STATUS_STEPS.findIndex((step) => step === statusLabel),
    [statusLabel],
  );

  if (id && order && order.paymentStatus !== 'paid') {
    return <Redirect href={`/review-order/${id}` as never} />;
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.orderId}>Order #{id ?? 'demo-order'}</Text>
        <Text style={styles.statusTitle}>{statusLabel}</Text>

        <View style={styles.mapCard}>
          <Map
            style={styles.map}
            initialRegion={{
              latitude: driver.location.latitude,
              longitude: driver.location.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            <MapMarker
              coordinate={{
                latitude: driver.location.latitude,
                longitude: driver.location.longitude,
              }}
              title="Driver"
              description={driver.name}
            />
            {order ? (
              <MapMarker
                coordinate={{
                  latitude: order.destination.latitude,
                  longitude: order.destination.longitude,
                }}
                title="Destination"
                description={order.dropoffLocation}
              />
            ) : null}
          </Map>
        </View>

        {order ? (
          <View style={styles.orderMetaCard}>
            <Text style={styles.orderMetaText}>Restaurant: {order.restaurantName}</Text>
            <Text style={styles.orderMetaText}>Dropoff: {order.dropoffLocation}</Text>
          </View>
        ) : null}

        <View style={styles.stepsWrap}>
          {STATUS_STEPS.map((step, idx) => {
            const done = idx <= activeStepIndex;
            return (
              <View key={step} style={styles.stepRow}>
                <View style={[styles.stepDot, done && styles.stepDotActive]} />
                <Text style={[styles.stepText, done && styles.stepTextActive]}>{step}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.driverCard}>
          <Text style={styles.driverTitle}>Driver</Text>
          <Text style={styles.driverMeta}>{driver.name}</Text>
          <Text style={styles.driverMeta}>{driver.car}</Text>
          <Text style={styles.driverMeta}>{driver.phone}</Text>

          <Pressable
            style={styles.callButton}
            onPress={() => console.log('Call Driver', driver.phone)}
          >
            <Text style={styles.callButtonText}>Call Driver</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flex: 1, padding: 16 },
  orderId: { color: '#64748B', fontWeight: '600' },
  statusTitle: { marginTop: 4, color: '#0F172A', fontSize: 30, fontWeight: '800' },
  mapCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  map: { width: '100%', height: 210 },
  orderMetaCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  orderMetaText: { color: '#334155', fontWeight: '600', marginBottom: 4 },
  stepsWrap: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 8,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#CBD5E1',
    marginRight: 10,
  },
  stepDotActive: { backgroundColor: '#2563EB' },
  stepText: { color: '#64748B', fontWeight: '600' },
  stepTextActive: { color: '#0F172A', fontWeight: '800' },
  driverCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  driverTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  driverMeta: { color: '#334155', fontWeight: '600', marginBottom: 3 },
  callButton: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButtonText: { color: '#FFFFFF', fontWeight: '800' },
});
