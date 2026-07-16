import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
};

export default function StatusActionButton({
  label,
  onPress,
  loading,
  disabled,
  tone = 'primary',
}: Props) {
  const isDisabled = Boolean(disabled || loading || !onPress);
  return (
    <Pressable
      style={[
        styles.base,
        tone === 'primary' && styles.primary,
        tone === 'secondary' && styles.secondary,
        tone === 'danger' && styles.danger,
        isDisabled && styles.disabled,
      ]}
      disabled={isDisabled}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'secondary' ? '#334155' : '#FFFFFF'} />
      ) : (
        <Text
          style={[
            styles.text,
            tone === 'secondary' && styles.secondaryText,
            tone === 'danger' && styles.dangerText,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primary: { backgroundColor: '#22C55E' },
  secondary: { backgroundColor: '#171923', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  danger: { backgroundColor: 'rgba(239,68,68,0.14)', borderWidth: 1, borderColor: '#EF4444' },
  disabled: { opacity: 0.6 },
  text: { color: '#FFFFFF', fontWeight: '800' },
  secondaryText: { color: '#B7BDC9' },
  dangerText: { color: '#B91C1C' },
});
