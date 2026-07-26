import { adminCardShell, adminColors as COLORS, adminFontFamily } from '@/constants/adminTheme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type AdminStatCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function AdminStatCard({
  label,
  value,
  hint,
  icon = 'analytics-outline',
  onPress,
  style,
}: AdminStatCardProps) {
  const inner = (
    <>
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={16} color={COLORS.primary} />
        </View>
        {onPress ? (
          <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
        ) : null}
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, style, pressed && styles.pressed]}
        onPress={onPress}
      >
        {inner}
      </Pressable>
    );
  }

  return <View style={[styles.card, style]}>{inner}</View>;
}

const styles = StyleSheet.create({
  card: {
    ...adminCardShell,
    minHeight: 118,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySoft,
  },
  label: {
    fontFamily: adminFontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  value: {
    fontFamily: adminFontFamily,
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  hint: {
    marginTop: 8,
    fontFamily: adminFontFamily,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});
