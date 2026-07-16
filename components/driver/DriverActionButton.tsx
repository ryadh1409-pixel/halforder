import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
};

export function DriverActionButton({ label, disabled, loading, onPress }: Props) {
  return (
    <Pressable
      style={[styles.button, (disabled || loading) && styles.disabled]}
      disabled={disabled || loading}
      onPress={onPress}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.text}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  text: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
