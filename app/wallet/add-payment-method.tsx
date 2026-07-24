import { presentWalletAddPaymentMethod } from '@/services/walletAddPaymentMethod';
import { showError, showSuccess } from '@/utils/toast';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const PAL = {
  bg: '#000000',
  text: '#FFFFFF',
  textMuted: '#7D8493',
  border: 'rgba(255,255,255,0.08)',
  primary: '#A855F7',
} as const;

/**
 * Opens Stripe PaymentSheet (SetupIntent) immediately — no custom Card / Apple Pay picker.
 */
export default function AddPaymentMethodScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('Opening Stripe…');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      setBusy(true);
      setMessage('Opening Stripe…');
      try {
        const result = await presentWalletAddPaymentMethod();
        if (result.status === 'success') {
          showSuccess('Payment method saved.');
          router.back();
          return;
        }
        if (result.status === 'canceled') {
          router.back();
          return;
        }
        if (result.status === 'failed' || result.status === 'unsupported') {
          showError(result.message);
          setMessage(result.message);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not open Stripe.';
        showError(msg);
        setMessage(msg);
      } finally {
        setBusy(false);
      }
    })();
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color={PAL.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Payment Method</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        {busy ? <ActivityIndicator color={PAL.primary} size="large" /> : null}
        <Text style={styles.hint}>{message}</Text>
        {!busy ? (
          <TouchableOpacity
            style={styles.retry}
            onPress={() => {
              started.current = false;
              setBusy(true);
              setMessage('Opening Stripe…');
              // re-trigger by remounting logic
              void (async () => {
                started.current = true;
                try {
                  const result = await presentWalletAddPaymentMethod();
                  if (result.status === 'success') {
                    showSuccess('Payment method saved.');
                    router.back();
                    return;
                  }
                  if (result.status === 'canceled') {
                    router.back();
                    return;
                  }
                  if (result.status === 'failed' || result.status === 'unsupported') {
                    showError(result.message);
                    setMessage(result.message);
                  }
                } catch (e) {
                  const msg = e instanceof Error ? e.message : 'Could not open Stripe.';
                  showError(msg);
                  setMessage(msg);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAL.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PAL.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: PAL.text,
    letterSpacing: -0.3,
  },
  body: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  hint: {
    color: PAL.textMuted,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  retry: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: PAL.primary,
  },
  retryText: { color: '#fff', fontWeight: '800' },
});
