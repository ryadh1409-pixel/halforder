import type { LucideIcon } from 'lucide-react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** Muted orange/gold — matches HalfOrder primary without harsh saturation. */
const ICON_TINT = '#F0A050';
const ICON_BG = 'rgba(255, 158, 64, 0.12)';
const ICON_BORDER = 'rgba(255, 158, 64, 0.2)';

export const PROFILE_MENU_COLORS = {
  surface: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.65)',
  textTertiary: 'rgba(255,255,255,0.42)',
  border: 'rgba(255,255,255,0.12)',
  iconTint: ICON_TINT,
  iconBg: ICON_BG,
  iconBorder: ICON_BORDER,
} as const;

export type ProfileMenuItemProps = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  onPress: () => void;
  /** Hide bottom divider (use on last item in a group). */
  isLast?: boolean;
};

export function ProfileMenuItem({
  title,
  subtitle,
  icon: Icon,
  onPress,
  isLast = false,
}: ProfileMenuItemProps) {
  const styles = useMemo(() => createStyles(), []);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.iconWrap}>
        <Icon
          size={22}
          color={ICON_TINT}
          strokeWidth={1.75}
          fill="none"
        />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <MaterialIcons
        name="chevron-right"
        size={22}
        color={PROFILE_MENU_COLORS.textTertiary}
      />
      {!isLast ? <View style={styles.divider} pointerEvents="none" /> : null}
    </Pressable>
  );
}

function createStyles() {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 16,
      paddingHorizontal: 16,
      minHeight: 68,
    },
    rowPressed: {
      opacity: 0.88,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: ICON_BG,
      borderWidth: 1,
      borderColor: ICON_BORDER,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    textCol: {
      flex: 1,
      minWidth: 0,
      paddingRight: 6,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: PROFILE_MENU_COLORS.text,
      letterSpacing: -0.25,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: '400',
      color: PROFILE_MENU_COLORS.textTertiary,
      lineHeight: 18,
    },
    divider: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: PROFILE_MENU_COLORS.border,
    },
  });
}
