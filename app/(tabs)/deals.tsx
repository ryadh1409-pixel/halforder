import { CountdownBadge } from '@/components/halforder/CountdownBadge';
import { halfOrderStyles } from '@/components/halforder/HalfOrderStyles';
import { HALFORDER_DEALS } from '@/constants/halforderMockData';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DealsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={halfOrderStyles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={halfOrderStyles.content}>
        <Text style={halfOrderStyles.pageTitle}>Host Deals</Text>
        <Text style={halfOrderStyles.pageSubtitle}>
          Limited offers from hosts and restaurants. Join before spots run out.
        </Text>

        {HALFORDER_DEALS.map((deal) => {
          const savings = deal.originalDelivery - deal.sharedDelivery;
          return (
            <View key={deal.id} style={halfOrderStyles.card}>
              <Text style={styles.title}>{deal.title}</Text>
              <Text style={styles.price}>{deal.price}</Text>
              <View style={styles.row}>
                <CountdownBadge minutesLeft={deal.endsInMinutes} />
                <Text style={styles.spots}>{deal.spotsLeft} spots left</Text>
              </View>
              <Pressable
                style={halfOrderStyles.ctaButton}
                onPress={() =>
                  router.push({
                    pathname: '/shared-order/[orderId]',
                    params: {
                      orderId: deal.id,
                      title: deal.title,
                      waitingCount: '1',
                      originalDelivery: String(deal.originalDelivery),
                      sharedDelivery: String(deal.sharedDelivery),
                      endsInMinutes: String(deal.endsInMinutes),
                      savings: String(savings),
                    },
                  })
                }
              >
                <Text style={halfOrderStyles.ctaButtonText}>
                  Join & Save ${savings}
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
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  price: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: '800',
    color: '#16A34A',
  },
  row: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spots: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
});
