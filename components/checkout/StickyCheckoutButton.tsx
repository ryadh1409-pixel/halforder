import { CK, checkoutPressableProps } from '@/constants/checkoutUi';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  label?: string;
  sublabel?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

function StickyCheckoutButtonInner({
  label = 'Next',
  sublabel,
  onPress,
  disabled,
  loading,
}: Props) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const isDisabled = Boolean(disabled || loading);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    console.log('[CHECKOUT NEXT CLICKED]', { label, disabled: isDisabled, loading });
    if (isDisabled) return;
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onPress();
  };

  const pressableStyle = [
    styles.btn,
    Platform.OS !== 'web' ? anim : null,
    isDisabled && styles.disabled,
    Platform.OS === 'web' && !isDisabled ? styles.webPointer : null,
  ];

  const pressHandlers =
    Platform.OS === 'web'
      ? { onPress: handlePress }
      : {
          onPressIn: () => {
            scale.value = withSpring(0.985, { damping: 16, stiffness: 400 });
          },
          onPressOut: () => {
            scale.value = withSpring(1, { damping: 12, stiffness: 260 });
          },
          onPress: handlePress,
        };

  const CtaPressable = Platform.OS === 'web' ? Pressable : AnimatedPressable;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom + 6, 14) }]} pointerEvents="box-none">
      <CtaPressable
        {...checkoutPressableProps}
        disabled={isDisabled}
        {...pressHandlers}
        style={pressableStyle}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.btnInner} pointerEvents="none">
            <Text style={styles.btnTxt}>{label}</Text>
            {sublabel ? <Text style={styles.sub}>{sublabel}</Text> : null}
          </View>
        )}
      </CtaPressable>
    </View>
  );
}

export const StickyCheckoutButton = memo(StickyCheckoutButtonInner);

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 18,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CK.headerHairline,
    backgroundColor: CK.bg,
  },
  btn: {
    borderRadius: CK.nextBtnRadius,
    height: 58,
    backgroundColor: CK.blackBtn,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#050505',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  webPointer: { cursor: 'pointer' as const },
  btnInner: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  btnTxt: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.1,
  },
  sub: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.78)' },
  disabled: { opacity: 0.38 },
});
