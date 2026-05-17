import { UE } from '@/constants/uberEatsTheme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  addressLine: string;
  onAddressPress?: () => void;
  onNotificationsPress?: () => void;
};

function HomeHeaderInner({
  addressLine,
  onAddressPress,
  onNotificationsPress,
}: Props) {
  const top = useSafeAreaInsets().top;

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(top, 8) }]}>
      <Pressable
        accessibilityRole="button"
        style={styles.addressBtn}
        onPress={() => {
          void Haptics.selectionAsync();
          onAddressPress?.();
        }}
      >
        <Text style={styles.now}>Now</Text>
        <View style={styles.addressRow}>
          <Text style={styles.address} numberOfLines={1}>
            {addressLine}
          </Text>
          <Ionicons
            name="chevron-down"
            size={18}
            color={UE.text}
            style={styles.chev}
          />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        hitSlop={12}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onNotificationsPress?.();
        }}
        style={styles.bell}
      >
        <Ionicons name="notifications-outline" size={24} color={UE.text} />
      </Pressable>
    </View>
  );
}

export const HomeHeader = memo(HomeHeaderInner);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: UE.spaceCard,
    paddingBottom: UE.spaceInline,
    backgroundColor: UE.bg,
  },
  addressBtn: { flex: 1, minWidth: 0, marginRight: 12 },
  now: {
    fontSize: UE.fontMicro,
    fontWeight: '700',
    color: UE.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  address: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    color: UE.text,
    letterSpacing: -0.2,
  },
  chev: { marginLeft: 2 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UE.surface,
    borderWidth: 1,
    borderColor: UE.borderLight,
  },
});
