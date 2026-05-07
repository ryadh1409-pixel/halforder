import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function ETAChip({ minutes }: { minutes: number }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>ETA ~{minutes} min</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  text: { color: '#166534', fontWeight: '800', fontSize: 12 },
});
