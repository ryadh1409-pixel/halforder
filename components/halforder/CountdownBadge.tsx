import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function CountdownBadge({ minutesLeft }: { minutesLeft: number }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{minutesLeft} min left</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  text: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '700',
  },
});
