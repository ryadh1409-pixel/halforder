import {
  customerStatusLabel,
  friendlyStatus,
} from '@/components/support/supportDisplay';
import type { SupportConversationStatus } from '@/services/supportConversations';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

function toneFor(status: SupportConversationStatus): { bg: string; fg: string } {
  switch (status) {
    case 'open':
      return { bg: 'rgba(168,85,247,0.18)', fg: '#C4B5FD' };
    case 'reviewing':
      return { bg: 'rgba(56,189,248,0.16)', fg: '#7DD3FC' };
    case 'waiting':
      return { bg: 'rgba(245,158,11,0.16)', fg: '#FBBF24' };
    case 'resolved':
      return { bg: 'rgba(34,197,94,0.16)', fg: '#4ADE80' };
    case 'closed':
      return { bg: 'rgba(148,163,184,0.14)', fg: '#94A3B8' };
    default:
      return { bg: 'rgba(168,85,247,0.18)', fg: '#C4B5FD' };
  }
}

export function SupportStatusChip({
  status,
  customerFacing = false,
}: {
  status: SupportConversationStatus;
  /** Softer copy for customer UI (no internal wording). */
  customerFacing?: boolean;
}) {
  const tone = toneFor(status);
  const display = customerFacing
    ? customerStatusLabel(status)
    : friendlyStatus(status);

  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <View style={[styles.dot, { backgroundColor: tone.fg }]} />
      <Text style={[styles.label, { color: tone.fg }]}>{display}</Text>
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
    paddingVertical: 5,
    borderRadius: 999,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
});
