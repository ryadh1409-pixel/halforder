import { COORDINATION_DISCLAIMER } from '@/constants/paymentDisclaimer';
import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

export function FoodCardPaymentDisclaimer({
  style,
}: {
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.text, style]}>{COORDINATION_DISCLAIMER}</Text>;
}

const styles = StyleSheet.create({
  text: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(148, 163, 184, 0.95)',
    fontWeight: '500',
    flexShrink: 1,
  },
});
