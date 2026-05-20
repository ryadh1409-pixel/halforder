import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const PROFILE_MENU_COLORS = {
  surface: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.65)',
  textTertiary: 'rgba(255,255,255,0.42)',
  border: 'rgba(255,255,255,0.12)',
  primary: '#FF7A00',
  danger: '#F87171',
  iconBg: 'rgba(255,255,255,0.08)',
} as const;

export type ProfileMenuItemProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  onPress: () => void;
  danger?: boolean;
  /** Hide bottom divider (use on last item in a group). */
  isLast?: boolean;
};

export function ProfileMenuItem({
  title,
  subtitle,
  icon: Icon,
  onPress,
  danger = false,
  isLast = false,
}: ProfileMenuItemProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const accent = danger ? PROFILE_MENU_COLORS.danger : PROFILE_MENU_COLORS.primary;
  const styles = useMemo(() => createStyles(accent, danger), [accent, danger]);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.985, { damping: 20, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 280 });
      }}
      style={[styles.row, animStyle]}
    >
      <View style={styles.iconWrap}>
        <Icon size={22} color={accent} strokeWidth={2} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight
        size={20}
        color={PROFILE_MENU_COLORS.textTertiary}
        strokeWidth={2}
      />
      {!isLast ? <View style={styles.divider} pointerEvents="none" /> : null}
    </AnimatedPressable>
  );
}

function createStyles(accent: string, danger: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 18,
      paddingHorizontal: 18,
      minHeight: 72,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: danger ? 'rgba(248,113,113,0.12)' : PROFILE_MENU_COLORS.iconBg,
      borderWidth: 1,
      borderColor: PROFILE_MENU_COLORS.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textCol: {
      flex: 1,
      minWidth: 0,
      paddingRight: 4,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: danger ? PROFILE_MENU_COLORS.danger : PROFILE_MENU_COLORS.text,
      letterSpacing: -0.2,
    },
    subtitle: {
      marginTop: 3,
      fontSize: 13,
      fontWeight: '500',
      color: PROFILE_MENU_COLORS.textTertiary,
      lineHeight: 18,
    },
    divider: {
      position: 'absolute',
      left: 18,
      right: 18,
      bottom: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: PROFILE_MENU_COLORS.border,
    },
  });
}
