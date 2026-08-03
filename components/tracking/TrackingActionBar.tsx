/**
 * Call / Message / Tip action row — presentation only.
 * Handlers wired by the track-order screen to existing navigation / tel: / alerts.
 */
import { UE } from '@/constants/uberEatsTheme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  messageEnabled: boolean;
  callEnabled: boolean;
  tipEnabled?: boolean;
  onMessage: () => void;
  onCall: () => void;
  onTip: () => void;
};

function Action({
  icon,
  label,
  enabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.btn, !enabled && styles.btnDisabled]}
      disabled={!enabled}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={20} color={enabled ? UE.text : UE.textMuted} />
      </View>
      <Text style={[styles.label, !enabled && styles.labelMuted]}>{label}</Text>
    </Pressable>
  );
}

export function TrackingActionBar({
  messageEnabled,
  callEnabled,
  tipEnabled = true,
  onMessage,
  onCall,
  onTip,
}: Props) {
  return (
    <View style={styles.row}>
      <Action
        icon="chatbubble-ellipses-outline"
        label="Message"
        enabled={messageEnabled}
        onPress={onMessage}
      />
      <Action icon="call-outline" label="Call" enabled={callEnabled} onPress={onCall} />
      <Action icon="heart-outline" label="Tip" enabled={tipEnabled} onPress={onTip} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: UE.radiusL,
    backgroundColor: UE.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UE.border,
  },
  btnDisabled: { opacity: 0.45 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UE.surface,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: UE.text,
  },
  labelMuted: { color: UE.textMuted },
});
