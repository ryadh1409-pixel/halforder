import { CK } from '@/constants/checkoutUi';
import { Ionicons } from '@expo/vector-icons';
import type { IoniconsProps } from '@expo/vector-icons/build/createIconSet';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  subtitlePlaceholder?: boolean;
  onPress: () => void;
};

function AddressRowInner({ icon, title, subtitle, subtitlePlaceholder, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <View style={styles.iconBubble}>
        <Ionicons name={icon as IoniconsProps['name']} size={20} color={CK.text} />
      </View>
      <View style={styles.mid}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, subtitlePlaceholder && styles.placeholder]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={CK.textMuted} style={styles.chev} />
    </Pressable>
  );
}

export const AddressRow = memo(AddressRowInner);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: Platform.OS === 'web' ? 14 : 16,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: CK.bg,
    borderWidth: 1,
    borderColor: CK.border,
    marginBottom: 10,
    shadowColor: CK.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pressed: { transform: [{ scale: 0.995 }], opacity: 0.95 },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: CK.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(12,12,14,0.05)',
  },
  mid: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '800', color: CK.text, letterSpacing: -0.15 },
  subtitle: { marginTop: 4, fontSize: 14, fontWeight: '600', color: CK.textSecondary, lineHeight: 19 },
  placeholder: { color: CK.textMuted, fontWeight: '600' },
  chev: { marginLeft: 4 },
});
