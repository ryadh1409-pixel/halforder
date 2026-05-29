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

const TRACK_PAD = 4;

function DeliverySegmentInner({ mode, onChange }: Props) {
  const win = useWindowDimensions();
  const outerTrack = Math.max(0, win.width - 32);
  const trackInner = Math.max(0, outerTrack - TRACK_PAD * 2);
  const seg = trackInner / 2;
  const x = useSharedValue(mode === 'delivery' ? 0 : seg);

  useEffect(() => {
    x.value = withSpring(mode === 'delivery' ? 0 : seg, { damping: 22, stiffness: 280 });
  }, [mode, seg, x]);

  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: Math.max(seg - TRACK_PAD * 2, 40),
  }));

  const select = (m: CheckoutFulfillmentMode) => {
    void Haptics.selectionAsync();
    onChange(m);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionEyebrow}>Fulfillment</Text>
      <View style={styles.trackOuter}>
        <View style={[styles.track, { padding: TRACK_PAD }]}>
          <Animated.View style={[styles.knobLayer, knob]} />
          <View style={[styles.flexRow]}>
            <Pressable {...checkoutPressableProps} style={[styles.cell, { width: seg }]} onPress={() => select('delivery')}>
              <Text style={[styles.label, mode === 'delivery' && styles.labelOn]}>Delivery</Text>
            </Pressable>
            <Pressable {...checkoutPressableProps} style={[styles.cell, { width: seg }]} onPress={() => select('pickup')}>
              <Text style={[styles.label, mode === 'pickup' && styles.labelOn]}>Pickup</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

export const DeliverySegment = memo(DeliverySegmentInner);

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginHorizontal: 16 },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: CK.textMuted,
    letterSpacing: 0.6,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  flexRow: { flexDirection: 'row', position: 'relative', zIndex: 1 },
  trackOuter: {
    borderRadius: 18,
    backgroundColor: CK.surface,
    borderWidth: 1,
    borderColor: CK.border,
    shadowColor: CK.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
    overflow: 'hidden',
  },
  track: { position: 'relative', minHeight: 50, overflow: 'hidden', borderRadius: 15 },
  knobLayer: {
    position: 'absolute',
    left: TRACK_PAD,
    top: TRACK_PAD,
    bottom: TRACK_PAD,
    borderRadius: 13,
    backgroundColor: CK.bg,
    shadowColor: '#060606',
    shadowOpacity: CK.cardShadowOpacity,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    zIndex: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  cell: { justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 15.5, fontWeight: '700', color: CK.textSecondary },
  labelOn: { color: CK.text, fontWeight: '900' },
});
