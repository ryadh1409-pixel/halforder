import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';

type Props = {
  style?: ViewStyle;
};

export default function CardField({ style }: Props) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderColor: '#CBD5E1',
          borderRadius: 12,
          paddingHorizontal: 12,
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
        },
        style,
      ]}
    >
      <Text style={{ color: '#64748B', fontSize: 13 }}>
        Payments available on mobile only
      </Text>
    </View>
  );
}
