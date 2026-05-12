import { RP } from '@/constants/restaurantPremiumTheme';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  itemCount: number;
  savings: number;
  total: number;
  onCheckout: () => void;
};

export function FloatingCartBar({ visible, itemCount, savings, total, onCheckout }: Props) {
  const insets = useSafeAreaInsets();
  const open = useSharedValue(0);

  useEffect(() => {
    open.value = withSpring(visible ? 1 : 0, { damping: 16, stiffness: 200 });
  }, [visible, open]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - open.value) * 120 }],
    opacity: open.value,
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.wrap,
        { bottom: Math.max(insets.bottom, 12) + 8 },
        anim,
      ]}
    >
      <View style={styles.card}>
        <View style={styles.left}>
          <Text style={styles.count}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Text>
          {savings > 0 ? (
            <Text style={styles.save}>You save ${savings.toFixed(2)}</Text>
          ) : (
            <Text style={styles.sub}>Subtotal</Text>
          )}
        </View>
        <View style={styles.mid}>
          <Text style={styles.total}>${total.toFixed(2)}</Text>
        </View>
        <Pressable
          style={styles.cta}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onCheckout();
          }}
        >
          <Text style={styles.ctaTxt}>Checkout</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: RP.bg,
    borderRadius: RP.radiusL,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: RP.border,
    gap: 10,
    shadowColor: RP.shadow,
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  left: { flex: 1, minWidth: 0 },
  count: { fontSize: 15, fontWeight: '900', color: RP.text },
  save: { marginTop: 2, fontSize: 12, fontWeight: '800', color: RP.accent },
  sub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: RP.textMuted },
  mid: { paddingHorizontal: 4 },
  total: { fontSize: 17, fontWeight: '900', color: RP.text },
  cta: {
    backgroundColor: RP.blackBtn,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTxt: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
