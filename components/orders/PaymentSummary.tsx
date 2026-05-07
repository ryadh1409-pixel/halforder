import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

function money(value: number): string {
  return `$${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`;
}

export default function PaymentSummary({
  subtotal,
  tax,
  deliveryFee,
  total,
}: {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.section}>Payment</Text>
      <View style={styles.line} />
      <View style={styles.row}>
        <Text style={styles.label}>Subtotal</Text>
        <Text style={styles.value}>{money(subtotal)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Tax</Text>
        <Text style={styles.value}>{money(tax)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Delivery Fee</Text>
        <Text style={styles.value}>{money(deliveryFee)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.total}>Total</Text>
        <Text style={styles.total}>{money(total)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
  },
  section: { color: '#0F172A', fontWeight: '800', fontSize: 16, marginBottom: 8 },
  line: { height: 1, backgroundColor: '#E2E8F0', marginTop: 4, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  label: { color: '#64748B', fontWeight: '700' },
  value: { color: '#0F172A', fontWeight: '600' },
  total: { color: '#0F172A', fontWeight: '800', fontSize: 16, marginTop: 6 },
});
