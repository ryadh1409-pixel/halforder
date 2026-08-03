/**
 * Compact floating tracking bubble (Uber Eats–style) — bottom-right.
 * Tap opens the existing full tracking screen.
 */
import { UE } from '@/constants/uberEatsTheme';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  etaLabel: string | null;
  avatarUri: string | null;
  initials: string;
  onPress: () => void;
};

export function FloatingTrackingBubble({
  visible,
  etaLabel,
  avatarUri,
  initials,
  onPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const open = useSharedValue(0);

  useEffect(() => {
    open.value = withSpring(visible ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [visible, open]);

  const anim = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [
      { scale: 0.85 + open.value * 0.15 },
      { translateY: (1 - open.value) * 24 },
    ],
  }));

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.wrap,
        { bottom: Math.max(insets.bottom, 12) + UE.tabBarHeight + 8 },
        anim,
      ]}
    >
      <Pressable
        style={styles.bubble}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel="Open live order tracking"
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarTxt}>{initials}</Text>
          </View>
        )}
        <View style={styles.meta}>
          <Text style={styles.live}>Live</Text>
          <Text style={styles.eta} numberOfLines={1}>
            {etaLabel ?? 'Tracking'}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    zIndex: 40,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: UE.radiusPill,
    backgroundColor: UE.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UE.border,
    shadowColor: UE.shadow,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.2)',
  },
  avatarTxt: {
    color: UE.accent,
    fontWeight: '800',
    fontSize: 14,
  },
  meta: { maxWidth: 88 },
  live: {
    fontSize: 10,
    fontWeight: '800',
    color: UE.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  eta: {
    marginTop: 1,
    fontSize: 14,
    fontWeight: '800',
    color: UE.text,
  },
});
