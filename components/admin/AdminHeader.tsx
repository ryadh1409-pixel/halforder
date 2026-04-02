import { adminColors as C } from '@/constants/adminTheme';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
};

export function AdminHeader({
  title,
  subtitle,
  backTo,
  backLabel = 'Back',
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 12) }]}>
      {backTo ? (
        <TouchableOpacity onPress={() => router.push(backTo as never)} hitSlop={12}>
          <Text style={styles.back}>← {backLabel}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← {backLabel}</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  back: { fontSize: 16, color: C.primary, fontWeight: '600', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: C.text },
  sub: { fontSize: 14, color: C.textMuted, marginTop: 4 },
});
