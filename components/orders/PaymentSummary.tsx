import {
  feeOrFreeLabel,
  formatHstLabel,
  moneyLabel,
  type OrderPricingBreakdown,
} from '@/lib/orderPricing';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Uber Eats–style payment summary (no tip / membership).
 */
export default function PaymentSummary({
  pricing,
}: {
  pricing: OrderPricingBreakdown;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.section}>Order Summary</Text>
      <View style={styles.line} />
      <View style={styles.row}>
        <Text style={styles.label}>Food subtotal</Text>
        <Text style={styles.value}>{moneyLabel(pricing.foodSubtotal)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{formatHstLabel(pricing.taxRate)}</Text>
        <Text style={styles.value}>{moneyLabel(pricing.hst)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Delivery fee</Text>
        <Text style={styles.value}>{feeOrFreeLabel(pricing.deliveryFee)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Service fee</Text>
        <Text style={styles.value}>{feeOrFreeLabel(pricing.serviceFee)}</Text>
      </View>
      {pricing.promoDiscount > 0 ? (
        <View style={styles.row}>
          <Text style={styles.label}>Promotion discount</Text>
          <Text style={styles.value}>-{moneyLabel(pricing.promoDiscount)}</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <Text style={styles.total}>Total paid</Text>
        <Text style={styles.total}>{moneyLabel(pricing.totalPaid)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#000000',
    padding: 14,
    marginBottom: 12,
  },
  section: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, marginBottom: 8 },
  line: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 4, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  label: { color: '#7D8493', fontWeight: '700' },
  value: { color: '#FFFFFF', fontWeight: '600' },
  total: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, marginTop: 6 },
});
