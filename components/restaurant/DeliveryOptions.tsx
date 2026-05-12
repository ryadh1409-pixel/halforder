import { RP } from '@/constants/restaurantPremiumTheme';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

export type DeliveryMode = 'delivery' | 'pickup' | 'group';

type Props = {
  mode: DeliveryMode;
  onChange: (m: DeliveryMode) => void;
};

const PAD = 16;

function thumbX(mode: DeliveryMode, segW: number) {
  const i = mode === 'delivery' ? 0 : mode === 'pickup' ? 1 : 2;
  return 4 + i * segW;
}

export function DeliveryOptions({ mode, onChange }: Props) {
  const { width: winW } = useWindowDimensions();
  const trackInner = winW - PAD * 2 - 8;
  const segW = trackInner / 3;
  const x = useSharedValue(thumbX(mode, segW));

  React.useEffect(() => {
    x.value = withSpring(thumbX(mode, segW), { damping: 18, stiffness: 220 });
  }, [mode, segW, x]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  const select = (m: DeliveryMode) => {
    void Haptics.selectionAsync();
    onChange(m);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Order type</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.thumb, { width: segW - 8 }, pillStyle]} />
        <View style={styles.row}>
          <Pressable style={[styles.cell, { width: segW }]} onPress={() => select('delivery')}>
            <Text style={[styles.label, mode === 'delivery' && styles.labelOn]}>Delivery</Text>
          </Pressable>
          <Pressable style={[styles.cell, { width: segW }]} onPress={() => select('pickup')}>
            <Text style={[styles.label, mode === 'pickup' && styles.labelOn]}>Pickup</Text>
          </Pressable>
          <Pressable style={[styles.cell, { width: segW }]} onPress={() => select('group')}>
            <Text style={[styles.label, mode === 'group' && styles.labelOn]}>Group</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: PAD, marginTop: 18 },
  title: { fontSize: 12, fontWeight: '800', color: RP.textMuted, marginBottom: 10, letterSpacing: 0.5 },
  track: {
    height: 48,
    borderRadius: 14,
    backgroundColor: RP.surface,
    borderWidth: 1,
    borderColor: RP.border,
    overflow: 'hidden',
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: 4,
    height: 40,
    borderRadius: 11,
    backgroundColor: RP.bg,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { flexDirection: 'row', height: '100%', zIndex: 1 },
  cell: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '700', color: RP.textSecondary },
  labelOn: { color: RP.text, fontWeight: '900' },
});
