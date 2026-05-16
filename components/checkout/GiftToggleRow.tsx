import { CK } from '@/constants/checkoutUi';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import { Switch, StyleSheet, Text, View } from 'react-native';

type Props = {
  checked: boolean;
  onToggle: (v: boolean) => void;
};

function GiftToggleRowInner({ checked, onToggle }: Props) {
  const trackColors = { false: CK.surface2, true: CK.text };

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.icon}>
          <Ionicons name="gift-outline" size={21} color={CK.text} />
        </View>
        <View>
          <Text style={styles.title}>Send as a gift</Text>
          <Text style={styles.sub}>Recipient gets notifications & tracking separately</Text>
        </View>
      </View>
      <Switch
        value={checked}
        onValueChange={(v) => {
          void Haptics.selectionAsync();
          onToggle(v);
        }}
        trackColor={{ false: trackColors.false, true: trackColors.true }}
        thumbColor="#FFF"
      />
    </View>
  );
}

export const GiftToggleRow = memo(GiftToggleRowInner);

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CK.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: CK.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CK.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  title: { fontSize: 15.5, fontWeight: '900', color: CK.text },
  sub: {
    marginTop: 4,
    fontSize: 12.5,
    fontWeight: '600',
    color: CK.textMuted,
    lineHeight: 16,
    maxWidth: 240,
  },
});
