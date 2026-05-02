import { adminColors as C } from '../../constants/adminTheme';
import { goBackSafe, goHome } from '../../lib/navigation';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  showHome?: boolean;
};

export function AdminHeader({
  title,
  subtitle,
  backTo,
  backLabel = 'Back',
  showHome = true,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.topRow} pointerEvents="box-none">
        {backTo ? (
          <TouchableOpacity onPress={() => router.push(backTo as never)} hitSlop={12}>
            <Text style={styles.back}>← {backLabel}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={goBackSafe} hitSlop={12}>
            <Text style={styles.back}>← {backLabel}</Text>
          </TouchableOpacity>
        )}
        {showHome ? (
          <TouchableOpacity onPress={goHome} hitSlop={12} style={styles.homeBtn}>
            <Text style={styles.homeText}>Home</Text>
          </TouchableOpacity>
        ) : null}
      </View>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  back: { fontSize: 16, color: C.primary, fontWeight: '600' },
  homeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
    backgroundColor: C.background,
  },
  homeText: { fontSize: 14, color: C.text, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '800', color: C.text },
  sub: { fontSize: 14, color: C.textMuted, marginTop: 4 },
});
