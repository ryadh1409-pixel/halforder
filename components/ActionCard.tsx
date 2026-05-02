import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const CARD = '#ffffff';
const TEXT = '#0f172a';
const PRIMARY = '#16a34a';

export type ActionCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ActionCard({ icon, label, onPress, style }: ActionCardProps) {
  return (
    <TouchableOpacity
      style={[styles.wrap, style]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={22} color={PRIMARY} />
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '22%',
    minWidth: 72,
    maxWidth: 96,
    aspectRatio: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: TEXT,
    textAlign: 'center',
    lineHeight: 14,
  },
});
