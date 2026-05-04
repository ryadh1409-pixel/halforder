import { useFocusEffect } from '@react-navigation/native';
import { Redirect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../services/AuthContext';
import { requireAuthReady } from '../services/authGuard';
import { ensureAuthReady } from '../services/firebase';
import { checkStripeStatus, startOnboarding } from '../services/stripeConnect';

export default function RestaurantOnboardingScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [ready, setReady] = useState(false);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureAuthReady()
      .then(() => {
        if (!cancelled) setFirebaseAuthReady(true);
      })
      .catch((e) => {
        console.warn('[restaurant-onboarding] ensureAuthReady failed', e);
        if (!cancelled) setFirebaseAuthReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!user?.uid) return;
    setChecking(true);
    try {
      await requireAuthReady();
      const status = await checkStripeStatus(user.uid);
      const stripeReady = status.details_submitted && status.charges_enabled;
      setReady(stripeReady);
      console.log('[restaurant-onboarding] checkStripeStatus:', status, 'ready:', stripeReady);
    } catch (e) {
      console.warn('[restaurant-onboarding] checkStripeStatus failed', e);
      setReady(false);
    } finally {
      setChecking(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      if (firebaseAuthReady && user?.uid) void refresh();
    }, [firebaseAuthReady, refresh, user?.uid]),
  );

  const handleCompleteStripeSetup = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      await startOnboarding(user.uid);
      await refresh();
    } catch (e) {
      console.warn('[restaurant-onboarding] startOnboarding', e);
    } finally {
      setLoading(false);
    }
  }, [refresh, user?.uid]);

  if (authLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator size="large" color="#635BFF" />
      </SafeAreaView>
    );
  }

  if (!user?.uid) return <Redirect href="/(auth)/login" />;

  const canUseStripe = firebaseAuthReady && !authLoading;
  const preparingAccount = !firebaseAuthReady || authLoading;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Setup Payments</Text>
        <Text style={styles.description}>
          Complete Stripe setup to receive payments
        </Text>
        {preparingAccount ? (
          <Text style={styles.preparing}>Preparing account…</Text>
        ) : checking ? (
          <ActivityIndicator color="#635BFF" style={styles.statusLoader} />
        ) : (
          <Text style={[styles.status, ready ? styles.ready : styles.notReady]}>
            {ready ? 'Stripe is ready to accept payments.' : 'Setup not completed yet.'}
          </Text>
        )}
        <Pressable
          style={[
            styles.button,
            (loading || checking || !canUseStripe) && styles.buttonDisabled,
          ]}
          disabled={loading || checking || !canUseStripe}
          onPress={() => void handleCompleteStripeSetup()}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Complete Stripe Setup</Text>
          )}
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={() => router.back()}>
          <Text style={styles.linkText}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7EBF3',
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#0A2540',
    textAlign: 'center',
  },
  description: {
    marginTop: 12,
    textAlign: 'center',
    color: '#425466',
    fontSize: 16,
    lineHeight: 24,
  },
  preparing: {
    marginTop: 16,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },
  statusLoader: { marginTop: 16 },
  status: {
    marginTop: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  ready: { color: '#15803D' },
  notReady: { color: '#92400E' },
  button: {
    marginTop: 24,
    width: '100%',
    height: 52,
    borderRadius: 12,
    backgroundColor: '#635BFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  linkBtn: { marginTop: 14, padding: 8 },
  linkText: { color: '#0A2540', fontWeight: '700' },
});
