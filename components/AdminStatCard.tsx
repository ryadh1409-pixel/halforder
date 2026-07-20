import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type AdminStatCardProps = {
  label: string;
  value: string;
  hint?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function AdminStatCard({
  label,
  value,
  hint,
  onPress,
  style,
}: AdminStatCardProps) {
  const inner = (
    <>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        activeOpacity={0.88}
      >
        {inner}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.card, style]}>{inner}</View>;
}

const styles = StyleSheet.create({
  card: {
    ...adminCardShell,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});
