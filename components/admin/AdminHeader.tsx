import { Ionicons } from '@expo/vector-icons';
import { adminColors as C } from '@/constants/adminTheme';
import { adminRoutes } from '@/constants/adminRoutes';
import { goHome } from '@/lib/navigation';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  title: string;
  subtitle?: string;
  /** When the stack cannot pop, navigate here instead of admin home (e.g. orders list). */
  fallbackRoute?: string;
  showHome?: boolean;
};

export function AdminHeader({
  title,
  subtitle,
  fallbackRoute,
  showHome = true,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const onBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const target = fallbackRoute ?? adminRoutes.home;
    router.replace(target as never);
  };

  const onHome = () => {
    goHome();
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: Math.max(insets.top, 10),
          ...Platform.select({
            ios: {
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08,
              shadowRadius: 6,
            },
            android: { elevation: 3 },
          }),
        },
      ]}
    >
      <View style={styles.toolbar} pointerEvents="box-none">
        <Pressable
          onPress={onBack}
          hitSlop={14}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={C.primary} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        {showHome ? (
          <Pressable
            onPress={onHome}
            hitSlop={14}
            style={({ pressed }) => [styles.homeBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Home"
          >
            <Ionicons name="home-outline" size={20} color="#0f172a" />
            <Text style={styles.homeLabel}>Home</Text>
          </Pressable>
        ) : (
          <View style={styles.homePlaceholder} />
        )}
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
    borderBottomColor: 'rgba(15, 23, 42, 0.1)',
    backgroundColor: '#ffffff',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingRight: 10,
  },
  homeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.25)',
  },
  homePlaceholder: { width: 88 },
  pressed: { opacity: 0.72 },
  backText: { fontSize: 16, color: C.primary, fontWeight: '600' },
  homeLabel: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  sub: { fontSize: 14, fontWeight: '500', color: C.textMuted, marginTop: 4 },
});
