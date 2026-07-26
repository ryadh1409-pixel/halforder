import { adminColors as COLORS, adminFontFamily } from '@/constants/adminTheme';
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

export type ActionCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ActionCard({ icon, label, onPress, style }: ActionCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.wrap, style, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={20} color={COLORS.primary} />
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '22%',
    minWidth: 72,
    maxWidth: 96,
    aspectRatio: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 4,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  label: {
    fontFamily: adminFontFamily,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 14,
  },
});
