import {
  driverMarketplaceFulfillmentStatusHint,
  getDriverMarketplaceFulfillmentButton,
  type DriverMarketplaceFulfillmentView,
} from '@/lib/driverMarketplaceFulfillment';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  order: DriverMarketplaceFulfillmentView;
  driverUid: string | null | undefined;
  busy: boolean;
  onPickup: () => void;
  onDeliver: () => void;
};

export function MarketplaceDeliveryActionBar({
  order,
  driverUid,
  busy,
  onPickup,
  onDeliver,
}: Props) {
  const action = getDriverMarketplaceFulfillmentButton(order, driverUid);
  const hint = driverMarketplaceFulfillmentStatusHint(order, driverUid);

  if (!action && !hint) return null;

  return (
    <View style={styles.wrap}>
      {hint && !action ? <Text style={styles.hint}>{hint}</Text> : null}
      {action ? (
        <Pressable
          style={[styles.btn, busy && styles.disabled]}
          disabled={busy}
          onPress={() => (action.action === 'pickup' ? onPickup() : onDeliver())}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>{action.label}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 10 },
  hint: { color: '#94A3B8', fontWeight: '600', fontSize: 14, lineHeight: 20 },
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
