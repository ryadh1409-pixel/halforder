import { UE } from '@/constants/uberEatsTheme';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

function SectionHeaderInner({ title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.textCol}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export const SectionHeader = memo(SectionHeaderInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: UE.spaceCard,
    marginBottom: UE.spaceInline,
    marginTop: UE.spaceSection,
  },
  textCol: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: UE.text,
    letterSpacing: -0.45,
    lineHeight: 28,
  },
  sub: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: UE.textMuted,
    lineHeight: 18,
  },
  action: {
    fontSize: UE.fontCaption,
    fontWeight: '800',
    color: UE.accent,
    textDecorationLine: 'underline',
  },
});
