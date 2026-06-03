import { UE } from '@/constants/uberEatsTheme';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

export type DeliveryMode = 'delivery' | 'pickup' | 'group';

type Props = {
  mode: DeliveryMode;
  onChange: (m: DeliveryMode) => void;
  onGroupOrder?: () => void;
  /** When true, delivery segment is disabled (outside delivery zone). */
  deliveryDisabled?: boolean;
};

const PAD = 16;

function thumbX(mode: DeliveryMode, segW: number) {
  return mode === 'pickup' ? 4 + segW : 4;
}

/** Delivery / Pickup pill + separate Group order CTA (Uber Eats action row). */
export function DeliveryOptions({
  mode,
  onChange,
  onGroupOrder,
  deliveryDisabled = false,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const trackInner = winW - PAD * 2 - 8;
  const segW = trackInner / 2;
  const activeMode = mode === 'pickup' ? 'pickup' : 'delivery';
  const x = useSharedValue(thumbX(activeMode, segW));

  React.useEffect(() => {
    x.value = withSpring(thumbX(activeMode, segW), {
      damping: 18,
      stiffness: 220,
    });
  }, [activeMode, segW, x]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  const select = (m: 'delivery' | 'pickup') => {
    void Haptics.selectionAsync();
    onChange(m);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <Animated.View style={[styles.thumb, { width: segW - 8 }, pillStyle]} />
        <View style={styles.row}>
          <Pressable
            style={[styles.cell, { width: segW }, deliveryDisabled && styles.cellDisabled]}
            disabled={deliveryDisabled}
            onPress={() => {
              if (!deliveryDisabled) select('delivery');
            }}
          >
            <Text
              style={[
                styles.label,
                activeMode === 'delivery' && styles.labelOn,
                deliveryDisabled && styles.labelDisabled,
              ]}
            >
              Delivery
            </Text>
          </Pressable>
          <Pressable
            style={[styles.cell, { width: segW }]}
            onPress={() => select('pickup')}
          >
            <Text
              style={[styles.label, activeMode === 'pickup' && styles.labelOn]}
            >
              Pickup
            </Text>
          </Pressable>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.groupBtn,
          pressed && styles.groupBtnPressed,
        ]}
        onPress={() => {
          void Haptics.selectionAsync();
          onChange('group');
          onGroupOrder?.();
        }}
      >
        <Ionicons name="people-outline" size={18} color={UE.text} />
        <Text style={styles.groupTxt}>Group order</Text>
        <Ionicons name="chevron-forward" size={16} color={UE.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: PAD, marginTop: 16, gap: 10 },
  track: {
    height: 48,
    borderRadius: UE.radiusPill,
    backgroundColor: UE.surface,
    borderWidth: 1,
    borderColor: UE.borderLight,
    overflow: 'hidden',
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: 4,
    height: 40,
    borderRadius: UE.radiusPill,
    backgroundColor: UE.bg,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  row: { flexDirection: 'row', height: '100%', zIndex: 1 },
  cell: { alignItems: 'center', justifyContent: 'center' },
  cellDisabled: { opacity: 0.4 },
  label: { fontSize: 15, fontWeight: '700', color: UE.textSecondary },
  labelOn: { color: UE.text, fontWeight: '900' },
  labelDisabled: { color: UE.textMuted },
  groupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: UE.radiusL,
    borderWidth: 1,
    borderColor: UE.borderLight,
    backgroundColor: UE.bg,
  },
  groupBtnPressed: { opacity: 0.92 },
  groupTxt: { flex: 1, fontSize: 15, fontWeight: '800', color: UE.text },
});
