import {
  driverMarketplaceFulfillmentStatusHint,
  getDriverMarketplaceFulfillmentButton,
  isDriverMarketplaceDeliveryComplete,
  type DriverMarketplaceFulfillmentAction,
  type DriverMarketplaceFulfillmentView,
} from '@/lib/driverMarketplaceFulfillment';
import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  order: DriverMarketplaceFulfillmentView;
  driverUid: string | null | undefined;
  busy: boolean;
  onAction: (action: DriverMarketplaceFulfillmentAction) => void;
};

export function MarketplaceDeliveryActionBar({
  order,
  driverUid,
  busy,
  onAction,
}: Props) {
  const courierStatus =
    typeof order.deliveryStatus === 'string' ? order.deliveryStatus : '';

  useEffect(() => {
    console.log('[ACTION BAR]', order.id, order.deliveryStatus);
  }, [order.id, courierStatus]);

  const completed = useMemo(
    () => isDriverMarketplaceDeliveryComplete(order, driverUid),
    [order, driverUid, courierStatus],
  );

  const action = useMemo(
    () => getDriverMarketplaceFulfillmentButton(order, driverUid),
    [order, driverUid, courierStatus],
  );

  const hint = useMemo(
    () => driverMarketplaceFulfillmentStatusHint(order, driverUid),
    [order, driverUid, courierStatus],
  );

  if (completed) {
    return (
      <View style={styles.wrap}>
        <View style={styles.completedBanner}>
          <Text style={styles.completedText}>Delivery completed</Text>
        </View>
      </View>
    );
  }

  if (!action) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.hint}>
          {hint ?? 'Waiting for the next delivery step. Pull to refresh if this looks wrong.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <Pressable
        style={[styles.btn, busy && styles.disabled]}
        disabled={busy}
        onPress={() => onAction(action.action)}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>{action.label}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  hint: { color: '#94A3B8', fontWeight: '600', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  btn: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 16,
  },
  disabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  completedBanner: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#166534',
    backgroundColor: '#052E16',
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  completedText: {
    color: '#22C55E',
    fontWeight: '800',
    fontSize: 17,
    textAlign: 'center',
  },
});
