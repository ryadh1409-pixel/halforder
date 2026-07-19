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

const CARD = '#171923';
const TEXT = '#FFFFFF';
const PRIMARY = '#A855F7';

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
    borderRadius: 18,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
    shadowColor: '#A855F7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(168, 85, 247, 0.16)',
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
