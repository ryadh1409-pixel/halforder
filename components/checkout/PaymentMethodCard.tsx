import type { CheckoutPaymentMethodPreview } from '@/types/checkoutFlow';
import { CK, checkoutPressableProps } from '@/constants/checkoutUi';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  method: CheckoutPaymentMethodPreview;
  onPress: () => void;
};

function BrandMark({ brand }: { brand: CheckoutPaymentMethodPreview['brand'] }) {
  const label = brand === 'mastercard' ? 'MC' : brand === 'visa' ? 'V' : brand === 'amex' ? 'AE' : '◆';
  return (
    <View
      style={[
        styles.icon,
        brand === 'visa' && styles.visa,
        brand === 'mastercard' && styles.mc,
        brand === 'amex' && styles.amex,
      ]}
    >
      <Text style={styles.iconTxt}>{label}</Text>
    </View>
  );
}

/** Stripe / wallet payment row — `method` from live Customer payment methods. */
function PaymentMethodCardInner({ method, onPress }: Props) {
  return (
    <Pressable
      {...checkoutPressableProps}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <BrandMark brand={method.brand} />
      <View style={styles.mid}>
        <Text style={styles.line1}>
          {method.id === 'apple_pay'
            ? 'Apple Pay'
            : method.id === 'none'
              ? 'No card saved'
              : method.brand === 'generic'
                ? `Card ···· ${method.last4}`
                : `${method.brand.charAt(0).toUpperCase() + method.brand.slice(1)} ···· ${method.last4}`}
        </Text>
        <Text style={styles.line2}>
          {method.cardholderName} · {method.expiryLabel}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={CK.textMuted} />
    </Pressable>
  );
}

export const PaymentMethodCard = memo(PaymentMethodCardInner);

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: CK.bg,
    shadowColor: CK.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    marginBottom: 10,
  },
  pressed: { transform: [{ scale: 0.992 }], opacity: 0.96 },
  icon: {
    width: 52,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CK.text,
  },
  visa: { backgroundColor: '#1434CB' },
  mc: { backgroundColor: '#EB001B' },
  amex: { backgroundColor: '#016FD0' },
  iconTxt: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.4 },
  mid: { flex: 1, minWidth: 0 },
  line1: { fontSize: 15.5, fontWeight: '900', color: CK.text },
  line2: { marginTop: 4, fontSize: 13, fontWeight: '600', color: CK.textSecondary },
});
