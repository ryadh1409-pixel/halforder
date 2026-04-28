import { CountdownBadge } from '@/components/halforder/CountdownBadge';
import { halfOrderStyles } from '@/components/halforder/HalfOrderStyles';
import { HALFORDER_FOOD_TRUCKS } from '@/constants/halforderMockData';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FoodTrucksScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={halfOrderStyles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={halfOrderStyles.content}>
        <Text style={halfOrderStyles.pageTitle}>Food Trucks</Text>
        <Text style={halfOrderStyles.pageSubtitle}>
          Nearby food trucks with active group orders.
        </Text>

        <View style={styles.locationPlaceholder}>
          <Text style={styles.locationText}>
            Location: Downtown Toronto (placeholder)
          </Text>
        </View>

        {HALFORDER_FOOD_TRUCKS.map((truck) => {
          const savings = truck.originalDelivery - truck.sharedDelivery;
          return (
            <View key={truck.id} style={halfOrderStyles.card}>
              <Text style={styles.name}>{truck.name}</Text>
              <Text style={styles.distance}>{truck.distance} away</Text>
              <Text style={styles.menuPreview}>{truck.menuPreview}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.waiting}>
                  👤 {truck.waitingCount} person waiting
                </Text>
                <CountdownBadge minutesLeft={truck.endsInMinutes} />
              </View>
              <Pressable
                style={halfOrderStyles.ctaButton}
                onPress={() =>
                  router.push({
                    pathname: '/shared-order/[orderId]',
                    params: {
                      orderId: truck.id,
                      title: truck.name,
                      waitingCount: String(truck.waitingCount),
                      originalDelivery: String(truck.originalDelivery),
                      sharedDelivery: String(truck.sharedDelivery),
                      endsInMinutes: String(truck.endsInMinutes),
                      savings: String(savings),
                    },
                  })
                }
              >
                <Text style={halfOrderStyles.ctaButtonText}>
                  Join group order
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  locationPlaceholder: {
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  locationText: {
    color: '#334155',
    fontWeight: '700',
  },
  name: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
  },
  distance: {
    color: '#16A34A',
    marginTop: 4,
    fontWeight: '700',
  },
  menuPreview: {
    color: '#475569',
    marginTop: 8,
    fontSize: 14,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waiting: {
    color: '#475569',
    fontWeight: '700',
  },
});
