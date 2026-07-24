import type { CheckoutPaymentMethodPreview } from '@/types/checkoutFlow';
import { CK } from '@/constants/checkoutUi';
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  /** @deprecated Custom payment pickers were removed — PaymentSheet is the only UI. */
  method?: CheckoutPaymentMethodPreview;
  onPress?: () => void;
};

/**
 * Informational payment row only. Method selection happens inside Stripe PaymentSheet.
 */
function PaymentMethodCardInner(_props: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Text style={styles.iconTxt}>◆</Text>
      </View>
      <View style={styles.mid}>
        <Text style={styles.line1}>Stripe PaymentSheet</Text>
        <Text style={styles.line2}>
          Apple Pay, Link, saved cards, and new cards — managed by Stripe
        </Text>
      </View>
    </View>
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
  icon: {
    width: 52,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CK.text,
  },
  iconTxt: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.4 },
  mid: { flex: 1, minWidth: 0 },
  line1: { fontSize: 15.5, fontWeight: '900', color: CK.text },
  line2: { marginTop: 4, fontSize: 13, fontWeight: '600', color: CK.textSecondary },
});
