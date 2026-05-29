import AppHeader from '@/components/AppHeader';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string; session_id?: string }>();
  const orderId = typeof params.orderId === 'string' ? params.orderId.trim() : '';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Payment received" />
      <View style={styles.center}>
        <Text style={styles.title}>Thank you!</Text>
        <Text style={styles.sub}>
          Your Stripe payment was submitted. We are confirming your order now — this usually
          takes a few seconds.
        </Text>
        {orderId ? (
          <Pressable
            style={styles.button}
            onPress={() => router.replace(USER_ROUTES.order(orderId) as never)}
          >
            <Text style={styles.buttonText}>Track order</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.button} onPress={() => router.replace('/(tabs)' as never)}>
            <Text style={styles.buttonText}>Back to home</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#0F172A', textAlign: 'center' },
  sub: {
    marginTop: 12,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 360,
  },
  button: {
    marginTop: 28,
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
