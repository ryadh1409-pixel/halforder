import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { DRIVER_ROUTES, type DriverTabKey, DRIVER_TAB_HREFS } from '@/lib/navigationPaths';
import { useRouter } from 'expo-router';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TABS: { name: DriverTabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'index', label: 'Hub', icon: 'grid' },
  { name: 'earnings', label: 'Earnings', icon: 'cash' },
  { name: 'driver-profile', label: 'Profile', icon: 'person' },
];

/**
 * Driver-only tab bar — always `router.push('/(driver)/…')`.
 * Never `navigation.navigate('profile')` (merges with the `(tabs)` navigator).
 */
function DriverTabBar({ state }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name as DriverTabKey | undefined;

  const onPress = useCallback(
    (name: DriverTabKey) => {
      if (activeRoute === name) return;
      if (name === 'driver-profile') {
        router.push(DRIVER_ROUTES.profile as never);
        return;
      }
      router.push(DRIVER_TAB_HREFS[name]);
    },
    [activeRoute, router],
  );

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(10, insets.bottom) }]}>
      {TABS.map((tab) => {
        const focused = activeRoute === tab.name;
        return (
          <Pressable
            key={tab.name}
            style={styles.item}
            onPress={() => onPress(tab.name)}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
          >
            <Ionicons name={tab.icon} size={22} color={focused ? '#00C853' : '#9CA3AF'} />
            <Text style={[styles.label, focused && styles.labelFocused]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default memo(DriverTabBar);

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#2A2A45',
    backgroundColor: '#151526',
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { color: '#7D8493', fontSize: 11, fontWeight: '700' },
  labelFocused: { color: '#00C853' },
});
