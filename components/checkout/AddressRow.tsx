import { CK, checkoutPressableProps } from '@/constants/checkoutUi';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  subtitlePlaceholder?: boolean;
  onPress: () => void;
  /** Hide bottom divider (last row in a group). */
  last?: boolean;
};

function AddressRowInner({
  icon,
  title,
  subtitle,
  subtitlePlaceholder,
  onPress,
  last,
}: Props) {
  return (
    <Pressable
      {...checkoutPressableProps}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.wrap,
        last && styles.wrapLast,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.iconBubble}>
        <Ionicons name={icon} size={18} color={CK.textSecondary} />
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
      <Ionicons
        name="chevron-forward"
        size={18}
        color={CK.textMuted}
        style={styles.chev}
      />
    </Pressable>
  );
}

export const AddressRow = memo(AddressRowInner);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: Platform.OS === 'web' ? 12 : 14,
    paddingHorizontal: 16,
    marginHorizontal: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  wrapLast: {
    borderBottomWidth: 0,
  },
  pressed: { opacity: 0.72 },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: CK.text,
    letterSpacing: -0.15,
  },
  subtitle: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '500',
    color: CK.textSecondary,
    lineHeight: 17,
  },
  placeholder: { color: CK.textMuted, fontWeight: '500' },
  chev: { marginLeft: 4 },
});
