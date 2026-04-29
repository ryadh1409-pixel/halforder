import { Map, MapMarker } from '@/components/Map';
import {
  acceptOrder,
  completeDelivery,
  startDelivery,
  useMockDeliveryOrders,
} from '@/services/mockDeliveryStore';
import { useAuth } from '@/services/AuthContext';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverDashboardScreen() {
  const orders = useMockDeliveryOrders();
  const { setTestingRole } = useAuth();

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Driver Dashboard</Text>
        <Text style={styles.subtitle}>Manage your active delivery flow</Text>
        <Pressable
          style={styles.roleSwitchButton}
          onPress={() => setTestingRole('user')}
        >
          <Text style={styles.roleSwitchButtonText}>Switch to User Mode</Text>
        </Pressable>

        {orders.map((order) => (
          <View key={order.id} style={styles.card}>
            <Text style={styles.truckName}>Order #{order.id}</Text>
            <Text style={styles.meta}>Restaurant: {order.restaurantName}</Text>
            <Text style={styles.meta}>Pickup: {order.pickupLocation}</Text>
            <Text style={styles.meta}>Dropoff: {order.dropoffLocation}</Text>
            <Text style={styles.status}>Status: {order.status}</Text>

            <View style={styles.mapWrap}>
              <Map
                style={styles.map}
                initialRegion={{
                  latitude: order.destination.latitude,
                  longitude: order.destination.longitude,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                }}
              >
                <MapMarker
                  coordinate={{
                    latitude: order.destination.latitude,
                    longitude: order.destination.longitude,
                  }}
                  title={order.restaurantName}
                  description={order.status}
                />
              </Map>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={[
                  styles.button,
                  order.status !== 'pending' && styles.buttonDisabled,
                ]}
                disabled={order.status !== 'pending'}
                onPress={() => acceptOrder(order.id)}
              >
                <Text style={styles.buttonText}>Accept Order</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.button,
                  order.status !== 'accepted' && styles.buttonDisabled,
                ]}
                disabled={order.status !== 'accepted'}
                onPress={() => startDelivery(order.id)}
              >
                <Text style={styles.buttonText}>Start Delivery</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.button,
                  styles.completeButton,
                  order.status !== 'delivering' && styles.buttonDisabled,
                ]}
                disabled={order.status !== 'delivering'}
                onPress={() => completeDelivery(order.id)}
              >
                <Text style={styles.buttonText}>Complete Delivery</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 28 },
  title: { color: '#0F172A', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 4, marginBottom: 12, color: '#64748B', fontWeight: '600' },
  roleSwitchButton: {
    marginBottom: 10,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  roleSwitchButtonText: { color: '#1D4ED8', fontWeight: '700' },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  truckName: { color: '#0F172A', fontSize: 19, fontWeight: '800' },
  meta: { marginTop: 4, color: '#475569', fontWeight: '600' },
  status: { marginTop: 6, color: '#1E3A8A', fontWeight: '700' },
  mapWrap: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  map: { width: '100%', height: 130 },
  actions: { marginTop: 10, gap: 8 },
  button: {
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
  },
  completeButton: { backgroundColor: '#16A34A' },
  buttonDisabled: { opacity: 0.35 },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
});
