import AppHeader from '@/components/AppHeader';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CheckoutCancelledScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId = typeof params.orderId === 'string' ? params.orderId.trim() : '';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Checkout cancelled" />
      <View style={styles.center}>
        <Text style={styles.title}>Payment not completed</Text>
        <Text style={styles.sub}>
          You left Stripe Checkout before paying. Your order is still saved — you can try again
          anytime.
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => {
            if (orderId) {
              router.replace({ pathname: '/checkout', params: { orderId } } as never);
              return;
            }
            router.back();
          }}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={() => router.back()}>
          <Text style={styles.linkText}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171923' },
  center: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  sub: {
    marginTop: 10,
    color: '#7D8493',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 360,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  link: { marginTop: 16, padding: 8 },
  linkText: { color: '#2563EB', fontWeight: '700' },
});
