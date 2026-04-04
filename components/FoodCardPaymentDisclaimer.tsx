import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

const COPY =
  'Payments are handled directly between users upon pickup. HalfOrder only facilitates matching between users.';

export function FoodCardPaymentDisclaimer({
  style,
}: {
  style?: StyleProp<TextStyle>;
}) {
  return <Text style={[styles.text, style]}>{COPY}</Text>;
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
