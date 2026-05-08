import {
  DELIVERY_STATUS,
  type DeliveryLifecycleStatus,
  NEXT_DELIVERY_STATUS,
} from '@/constants/deliveryStatus';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

function actionLabel(status: DeliveryLifecycleStatus): string {
  if (status === DELIVERY_STATUS.ACCEPTED) return 'Confirm arrival';
  if (status === DELIVERY_STATUS.ARRIVED_AT_RESTAURANT) return 'Confirm pickup';
  if (status === DELIVERY_STATUS.PICKED_UP) return 'Start delivery';
  if (status === DELIVERY_STATUS.ON_THE_WAY) return 'Arrived at customer';
  if (status === DELIVERY_STATUS.ARRIVED_CUSTOMER) return 'Complete delivery';
  return 'Update';
}

export function DeliveryActionBar({
  status,
  busy,
  onAdvance,
}: {
  status: DeliveryLifecycleStatus;
  busy: boolean;
  onAdvance: (nextStatus: DeliveryLifecycleStatus) => void;
}) {
  const next = NEXT_DELIVERY_STATUS[status];
  if (!next) return null;
  return (
    <View style={styles.wrap}>
      <Pressable style={[styles.btn, busy && styles.disabled]} disabled={busy} onPress={() => onAdvance(next)}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{actionLabel(status)}</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  btn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
  },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
