import type { CheckoutFulfillmentMode } from '@/types/checkoutFlow';
import { CK, checkoutPressableProps } from '@/constants/checkoutUi';
import * as Haptics from 'expo-haptics';
import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type Props = {
  mode: CheckoutFulfillmentMode;
  onChange: (m: CheckoutFulfillmentMode) => void;
};

const TRACK_PAD = 3;

function DeliverySegmentInner({ mode, onChange }: Props) {
  const win = useWindowDimensions();
  const outerTrack = Math.max(0, win.width - 32);
  const trackInner = Math.max(0, outerTrack - TRACK_PAD * 2);
  const seg = trackInner / 2;
  const x = useSharedValue(mode === 'delivery' ? 0 : seg);

  useEffect(() => {
    x.value = withSpring(mode === 'delivery' ? 0 : seg, { damping: 24, stiffness: 320 });
  }, [mode, seg, x]);

  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: Math.max(seg, 40),
  }));

  const select = (m: CheckoutFulfillmentMode) => {
    void Haptics.selectionAsync();
    onChange(m);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.track, { padding: TRACK_PAD }]}>
        <Animated.View style={[styles.knob, knob]} />
        <View style={styles.flexRow}>
          <Pressable
            {...checkoutPressableProps}
            style={[styles.cell, { width: seg }]}
            onPress={() => select('delivery')}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'delivery' }}
          >
            <Text style={[styles.label, mode === 'delivery' && styles.labelOn]}>
              Delivery
            </Text>
          </Pressable>
          <Pressable
            {...checkoutPressableProps}
            style={[styles.cell, { width: seg }]}
            onPress={() => select('pickup')}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'pickup' }}
          >
            <Text style={[styles.label, mode === 'pickup' && styles.labelOn]}>
              Pickup
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export const DeliverySegment = memo(DeliverySegmentInner);

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  flexRow: { flexDirection: 'row', position: 'relative', zIndex: 1 },
  track: {
    position: 'relative',
    minHeight: 36,
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  knob: {
    position: 'absolute',
    left: TRACK_PAD,
    top: TRACK_PAD,
    bottom: TRACK_PAD,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    zIndex: 0,
  },
  cell: { justifyContent: 'center', alignItems: 'center', minHeight: 30 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: CK.textMuted,
    letterSpacing: -0.1,
  },
  labelOn: {
    color: CK.text,
    fontWeight: '700',
  },
});
