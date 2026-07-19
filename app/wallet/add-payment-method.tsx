import { presentWalletAddPaymentMethod } from '@/services/walletAddPaymentMethod';
import { resolveApplePayAvailable } from '@/services/walletPaymentMethods';
import { showError, showSuccess } from '@/utils/toast';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
  surface: '#171923',
  surfaceMuted: '#1E2230',
  text: '#FFFFFF',
  textMuted: '#7D8493',
  border: 'rgba(255,255,255,0.08)',
  primary: '#A855F7',
} as const;

export default function AddPaymentMethodScreen() {
  const router = useRouter();
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingApple, setCheckingApple] = useState(true);

  useEffect(() => {
    void (async () => {
      const apple = await resolveApplePayAvailable();
      setApplePayAvailable(apple);
      setCheckingApple(false);
    })();
  }, []);

  const onAddCard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await presentWalletAddPaymentMethod();
      if (result.status === 'success') {
        showSuccess('Payment method saved.');
        router.back();
      } else if (result.status === 'failed' || result.status === 'unsupported') {
        showError(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onApplePay = async () => {
    // Stripe PaymentSheet setup already offers Apple Pay when supported;
    // same flow as card so the user can choose Apple Pay in sheet.
    await onAddCard();
  };

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
        <TouchableOpacity
          style={styles.optionRow}
          onPress={() => void onAddCard()}
          disabled={busy}
          activeOpacity={0.85}
        >
          <View style={styles.iconWrap}>
            <MaterialIcons name="credit-card" size={24} color={PAL.primary} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.optionTitle}>Credit or Debit Card</Text>
            <Text style={styles.optionSub}>Visa, Mastercard, Amex, and more</Text>
          </View>
          {busy ? (
            <ActivityIndicator color={PAL.primary} />
          ) : (
            <MaterialIcons name="chevron-right" size={22} color={PAL.textMuted} />
          )}
        </TouchableOpacity>

        {checkingApple ? (
          <View style={styles.optionRow}>
            <ActivityIndicator color={PAL.primary} />
          </View>
        ) : applePayAvailable ? (
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => void onApplePay()}
            disabled={busy}
            activeOpacity={0.85}
          >
            <View style={styles.iconWrap}>
              <MaterialIcons name="phone-iphone" size={24} color={PAL.text} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.optionTitle}>Apple Pay</Text>
              <Text style={styles.optionSub}>Pay with cards in Apple Wallet</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={PAL.textMuted} />
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
  body: { padding: 20 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: PAL.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PAL.border,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: PAL.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  optionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: PAL.text,
  },
  optionSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '500',
    color: PAL.textMuted,
  },
});
