import { adminColors as COLORS, adminFontFamily } from '@/constants/adminTheme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

/** Matches Command Center `scrollContent` padding and `actionsGrid` gap. */
const GRID_HORIZONTAL_PAD = 20;
const GRID_GAP = 12;
const GRID_COLS = 3;

export type ActionCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ActionCard({ icon, label, onPress, style }: ActionCardProps) {
  const { width: winW } = useWindowDimensions();
  const cellW =
    (winW - GRID_HORIZONTAL_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.wrap,
        { width: cellW },
        style,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={20} color={COLORS.primary} />
      </View>
      <Text
        style={styles.label}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    aspectRatio: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 6,
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
    width: '100%',
  },
});
