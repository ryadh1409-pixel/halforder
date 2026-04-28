import { CountdownBadge } from '@/components/halforder/CountdownBadge';
import { halfOrderStyles } from '@/components/halforder/HalfOrderStyles';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function getNumberParam(
  value: string | string[] | undefined,
  fallback: number,
): number {
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function SharedOrderScreen() {
  const params = useLocalSearchParams<{
    title?: string;
    waitingCount?: string;
    originalDelivery?: string;
    sharedDelivery?: string;
    endsInMinutes?: string;
    savings?: string;
  }>();

  const title =
    typeof params.title === 'string' ? params.title : 'Nearby shared order';
  const waitingCount = getNumberParam(params.waitingCount, 1);
  const originalDelivery = getNumberParam(params.originalDelivery, 8);
  const sharedDelivery = getNumberParam(params.sharedDelivery, 3);
  const endsInMinutes = getNumberParam(params.endsInMinutes, 15);
  const savings = getNumberParam(
    params.savings,
    originalDelivery - sharedDelivery,
  );

  return (
    <SafeAreaView style={halfOrderStyles.screen} edges={['top']}>
      <View style={styles.wrapper}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          Join this order now to reduce your delivery cost.
        </Text>

        <View style={styles.focusCard}>
          <Text style={styles.line}>👤 {waitingCount} person waiting</Text>
          <Text style={styles.line}>
            💸 Delivery: ${originalDelivery} to ${sharedDelivery}
          </Text>
          <View style={styles.timerWrap}>
            <Text style={styles.timerLabel}>⏳</Text>
            <CountdownBadge minutesLeft={endsInMinutes} />
          </View>

          <Pressable style={halfOrderStyles.ctaButton}>
            <Text style={halfOrderStyles.ctaButtonText}>
              Join Now & Save ${savings}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    gap: 14,
  },
  title: {
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 15,
    marginBottom: 6,
  },
  focusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 10,
  },
  line: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
  },
  timerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  timerLabel: {
    fontSize: 18,
  },
});
