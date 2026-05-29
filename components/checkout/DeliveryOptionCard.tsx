import type { CheckoutDeliveryTiming } from '@/types/checkoutFlow';
import { CK, checkoutPressableProps } from '@/constants/checkoutUi';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  variant: CheckoutDeliveryTiming;
  title: string;
  estimate: string;
  priceAdjustment: string;
  selected: boolean;
  onSelect: () => void;
};

/**
 * Timing tile with spring selection + lightning affordance on priority.
 */
function DeliveryOptionCardInner({
  variant,
  title,
  estimate,
  priceAdjustment,
  selected,
  onSelect,
}: Props) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (selected) {
      pulse.value = withSequence(
        withTiming(1.015, { duration: 140 }),
        withSpring(1, { damping: 14, stiffness: 220 }),
      );
    }
  }, [pulse, selected]);

  const cardAnim = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const open = () => {
    void Haptics.selectionAsync();
    onSelect();
  };

  return (
    <View style={styles.flex}>
      <Animated.View style={[styles.cardOuter, selected && styles.cardOuterOn, cardAnim]}>
        <Pressable {...checkoutPressableProps} onPress={open} style={styles.pressFill}>
          {variant === 'priority' ? (
            <View style={styles.flashRow}>
              <Ionicons name="flash" size={13} color={CK.text} />
              <Text style={styles.flash}>Fast</Text>
            </View>
          ) : null}
          <Text style={styles.tileTitle}>{title}</Text>
          <Text style={styles.est}>{estimate}</Text>
          {priceAdjustment ? (
            <Text style={styles.price}>{priceAdjustment}</Text>
          ) : (
            <View style={styles.priceSpacer} />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

export const DeliveryOptionCard = memo(DeliveryOptionCardInner);

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  cardOuter: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7E8EC',
    backgroundColor: CK.surface,
    shadowColor: '#04060a',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: 'hidden',
  },
  cardOuterOn: {
    borderWidth: 2.5,
    borderColor: CK.text,
    backgroundColor: CK.bg,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  pressFill: { paddingHorizontal: 12, paddingVertical: 13, minHeight: 118 },
  flashRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flash: { fontSize: 11, fontWeight: '900', color: CK.text },
  tileTitle: { marginTop: 4, fontSize: 17, fontWeight: '900', color: CK.text },
  est: {
    marginTop: 6,
    fontSize: 12.5,
    fontWeight: '600',
    color: CK.textSecondary,
    lineHeight: 17,
  },
  price: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: CK.offer,
  },
  priceSpacer: { height: 15, marginTop: 10 },
});
