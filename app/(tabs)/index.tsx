import { CountdownBadge } from '@/components/halforder/CountdownBadge';
import {
  halfOrderColors,
  halfOrderStyles,
} from '@/components/halforder/HalfOrderStyles';
import { HALFORDER_ACTIVE_ORDERS } from '@/constants/halforderMockData';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={halfOrderStyles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={halfOrderStyles.content}>
        <Text style={halfOrderStyles.pageTitle}>HalfOrder</Text>
        <Text style={halfOrderStyles.pageSubtitle}>
          Active orders nearby - split delivery and save now.
        </Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Someone near you is ordering</Text>
          <Text style={styles.heroTitle}>Save up to $5 on delivery</Text>
          <Text style={styles.heroSubtitle}>
            Join a nearby order before it expires.
          </Text>
          <Pressable
            style={halfOrderStyles.ctaButton}
            onPress={() => router.push('/deals' as never)}
          >
            <Text style={halfOrderStyles.ctaButtonText}>See Deals</Text>
          </Pressable>
        </View>

        <View style={styles.navRow}>
          <Pressable
            style={[halfOrderStyles.card, styles.navCard]}
            onPress={() => router.push('/deals' as never)}
          >
            <Text style={styles.navTitle}>Deals</Text>
            <Text style={styles.navSubtitle}>
              Limited spots, bigger savings
            </Text>
          </Pressable>
          <Pressable
            style={[halfOrderStyles.card, styles.navCard]}
            onPress={() => router.push('/food-trucks' as never)}
          >
            <Text style={styles.navTitle}>Food Trucks</Text>
            <Text style={styles.navSubtitle}>Nearby trucks and groups</Text>
          </Pressable>
        </View>

        {HALFORDER_ACTIVE_ORDERS.map((order) => {
          const saving = order.originalDelivery - order.sharedDelivery;
          return (
            <View key={order.id} style={halfOrderStyles.card}>
              <Text style={styles.orderTitle}>{order.title}</Text>
              <Text style={styles.orderHost}>{order.hostLabel}</Text>
              <View style={halfOrderStyles.savingsChip}>
                <Text style={halfOrderStyles.savingsChipText}>
                  {order.savingsText}
                </Text>
              </View>
              <View style={styles.orderMetaRow}>
                <Text style={styles.metaText}>
                  👤 {order.waitingCount} person waiting
                </Text>
                <Text style={styles.metaText}>
                  💸 Delivery: ${order.originalDelivery} to $
                  {order.sharedDelivery}
                </Text>
              </View>
              <View style={styles.orderFooter}>
                <CountdownBadge minutesLeft={order.endsInMinutes} />
                <Pressable
                  style={styles.joinButton}
                  onPress={() =>
                    router.push({
                      pathname: '/shared-order/[orderId]',
                      params: {
                        orderId: order.id,
                        title: order.title,
                        waitingCount: String(order.waitingCount),
                        originalDelivery: String(order.originalDelivery),
                        sharedDelivery: String(order.sharedDelivery),
                        endsInMinutes: String(order.endsInMinutes),
                        savings: String(saving),
                      },
                    } as never)
                  }
                >
                  <Text style={styles.joinButtonText}>
                    Join & Save ${saving}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 18,
  },
  heroEyebrow: {
    color: '#86EFAC',
    fontWeight: '700',
    fontSize: 13,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 27,
    fontWeight: '800',
    marginTop: 6,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    marginTop: 6,
    fontSize: 14,
  },
  navRow: {
    flexDirection: 'row',
    gap: 12,
  },
  navCard: {
    flex: 1,
  },
  navTitle: {
    color: halfOrderColors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  navSubtitle: {
    color: halfOrderColors.textSecondary,
    marginTop: 5,
    fontSize: 13,
  },
  orderTitle: {
    color: halfOrderColors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  orderHost: {
    color: halfOrderColors.textSecondary,
    marginTop: 6,
    fontSize: 14,
  },
  orderMetaRow: {
    marginTop: 10,
    gap: 4,
  },
  metaText: {
    color: halfOrderColors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  orderFooter: {
    marginTop: 12,
    gap: 12,
  },
  joinButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: halfOrderColors.savings,
  },
  joinButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
