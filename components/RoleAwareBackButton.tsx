import { goBackSafe } from '../lib/navigation';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

type RoleAwareBackButtonProps = {
  label?: string;
};

export default function RoleAwareBackButton({
  label = '\u2190 Back',
}: RoleAwareBackButtonProps) {
  const onPress = () => {
    if (__DEV__) {
      console.log('[RoleAwareBackButton] press', label);
    }
    goBackSafe();
  };

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    zIndex: 10,
    elevation: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
});
