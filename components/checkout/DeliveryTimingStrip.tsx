import { DeliveryOptionCard } from '@/components/checkout/DeliveryOptionCard';
import { CK } from '@/constants/checkoutUi';
import type { CheckoutDeliveryTiming } from '@/types/checkoutFlow';
import React, { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  value: CheckoutDeliveryTiming;
  onChange: (v: CheckoutDeliveryTiming) => void;
};

const OPTIONS: readonly {
  id: CheckoutDeliveryTiming;
  title: string;
  est: string;
  price: string;
}[] = [
  { id: 'priority', title: 'Priority', est: '~20–28 min', price: '+$2.49' },
  { id: 'standard', title: 'Standard', est: '30–42 min', price: 'Included' },
  { id: 'scheduled', title: 'Schedule', est: 'Pick a window', price: '' },
];

function DeliveryTimingStripInner({ value, onChange }: Props) {
  return (
    <View style={styles.block}>
      <Text style={styles.eyebrow}>Delivery timing</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {OPTIONS.map((o) => (
          <View key={o.id} style={styles.cardSlot}>
            <DeliveryOptionCard
              variant={o.id}
              title={o.title}
              estimate={o.est}
              priceAdjustment={o.price}
              selected={value === o.id}
              onSelect={() => onChange(o.id)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export const DeliveryTimingStrip = memo(DeliveryTimingStripInner);

const styles = StyleSheet.create({
  block: { marginTop: 8 },
  eyebrow: {
    paddingHorizontal: 16,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.65,
    textTransform: 'uppercase',
    color: CK.textMuted,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 2,
  },
  cardSlot: { width: 124, marginRight: 11 },
});
