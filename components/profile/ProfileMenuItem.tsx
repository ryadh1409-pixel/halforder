import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileGrowIcon } from './ProfileGrowIcon';
import type { ProfileGrowIconKind } from './profileGrowIconShared';

export const PROFILE_MENU_COLORS = {
  surface: '#1C1C1E',
  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.65)',
  textTertiary: 'rgba(255,255,255,0.42)',
  border: 'rgba(255,255,255,0.12)',
} as const;

export type ProfileMenuItemProps = {
  title: string;
  subtitle: string;
  iconKind: ProfileGrowIconKind;
  onPress: () => void;
  /** Hide bottom divider (use on last item in a group). */
  isLast?: boolean;
};

export function ProfileMenuItem({
  title,
  subtitle,
  iconKind,
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
      <ProfileGrowIcon kind={iconKind} />
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
        style={styles.chevron}
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
    textCol: {
      flex: 1,
      minWidth: 0,
      paddingRight: 4,
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
    chevron: {
      marginLeft: 2,
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
