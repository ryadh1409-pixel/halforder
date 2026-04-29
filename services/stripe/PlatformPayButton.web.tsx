import React from 'react';
import { Pressable, Text, type ViewStyle } from 'react-native';

type Props = {
  style?: ViewStyle;
  onPress?: () => void;
  disabled?: boolean;
};

export default function PlatformPayButton({ style, onPress, disabled }: Props) {
  return (
    <Pressable
      style={[
        {
          borderWidth: 1,
          borderColor: '#CBD5E1',
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
          opacity: disabled ? 0.7 : 1,
        },
        style,
      ]}
      onPress={disabled ? undefined : onPress}
    >
      <Text style={{ color: '#334155', fontWeight: '700' }}>
        Payments available on mobile only
      </Text>
    </Pressable>
  );
}
