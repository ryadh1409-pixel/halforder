import { adminColors as COLORS } from '@/constants/adminTheme';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function FinanceSection({ title, subtitle, children }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  title: {
    color: COLORS.textMuted,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 12,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 12,
    marginBottom: 8,
  },
});
