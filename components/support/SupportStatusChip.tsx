import { supportStatusChip, type SupportConversationStatus } from '@/services/supportConversations';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function SupportStatusChip({
  status,
}: {
  status: SupportConversationStatus;
}) {
  const chip = supportStatusChip(status);
  return (
    <View style={[styles.chip, { borderColor: chip.color }]}>
      <Text style={styles.emoji}>{chip.emoji}</Text>
      <Text style={[styles.label, { color: chip.color }]}>{chip.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  emoji: { fontSize: 12 },
  label: { fontSize: 12, fontWeight: '700' },
});
