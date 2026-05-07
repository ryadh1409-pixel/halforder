import type { OrderStatus } from '@/services/orderService';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  status: OrderStatus;
  loading?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onMarkReady: () => void;
};

export default function OrderActions({
  status,
  loading,
  onAccept,
  onReject,
  onMarkReady,
}: Props) {
  if (status === 'pending') {
    return (
      <View style={styles.row}>
        <Pressable style={styles.primary} onPress={onAccept} disabled={loading}>
          <Text style={styles.primaryText}>Accept Order</Text>
        </Pressable>
        <Pressable style={styles.danger} onPress={onReject} disabled={loading}>
          <Text style={styles.dangerText}>Reject</Text>
        </Pressable>
      </View>
    );
  }
  if (status === 'accepted' || status === 'restaurant_accepted' || status === 'preparing') {
    return (
      <Pressable style={styles.primary} onPress={onMarkReady} disabled={loading}>
        <Text style={styles.primaryText}>Mark Ready</Text>
      </Pressable>
    );
  }
  if (status === 'ready' || status === 'ready_for_pickup') {
    return <Text style={styles.waiting}>Waiting Driver</Text>;
  }
  return null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  primary: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
  danger: {
    width: 100,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  dangerText: { color: '#B91C1C', fontWeight: '800' },
  waiting: { color: '#334155', fontWeight: '700', marginTop: 12 },
});
