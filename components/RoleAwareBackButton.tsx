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
    backgroundColor: '#09090B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  text: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
