import type { OrderStatus, PaymentStatus } from '@/services/orderService';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

function statusTone(status: OrderStatus): { bg: string; fg: string } {
  switch (status) {
    case 'pending':
      return { bg: '#FFEDD5', fg: '#C2410C' };
    case 'accepted':
    case 'restaurant_accepted':
    case 'preparing':
      return { bg: '#DBEAFE', fg: '#1D4ED8' };
    case 'ready':
    case 'ready_for_pickup':
      return { bg: '#DCFCE7', fg: '#166534' };
    case 'delivered':
      return { bg: '#E5E7EB', fg: '#374151' };
    case 'cancelled':
    case 'rejected':
      return { bg: '#FEE2E2', fg: '#991B1B' };
    default:
      return { bg: '#B7BDC9', fg: '#334155' };
  }
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = statusTone(status);
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{status.replace(/_/g, ' ')}</Text>
    </View>
  );
}

export function PaymentBadge({ paymentStatus }: { paymentStatus: PaymentStatus }) {
  const paid = paymentStatus === 'paid';
  return (
    <View style={[styles.badge, { backgroundColor: paid ? '#DCFCE7' : '#FEF3C7' }]}>
      <Text style={[styles.text, { color: paid ? '#166534' : '#92400E' }]}>
        {paid ? 'Paid' : 'Unpaid'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  text: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
});
