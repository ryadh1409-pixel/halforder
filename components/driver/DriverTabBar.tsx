import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type DriverTabKey = 'index' | 'dispatch' | 'earnings' | 'profile';

const TABS: { name: DriverTabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'index', label: 'Hub', icon: 'grid' },
  { name: 'dispatch', label: 'Orders', icon: 'list' },
  { name: 'earnings', label: 'Earnings', icon: 'cash' },
  { name: 'profile', label: 'Profile', icon: 'person' },
];

/**
 * In-stack tab bar — uses React Navigation tab navigation only (never `/orders` root href).
 */
function DriverTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name as DriverTabKey | undefined;

  const onPress = useCallback(
    (name: DriverTabKey) => {
      const route = state.routes.find((r) => r.name === name);
      if (!route) return;
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!event.defaultPrevented && activeRoute !== name) {
        navigation.navigate(name);
      }
    },
    [activeRoute, navigation, state.routes],
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
  label: { color: '#9CA3AF', fontSize: 11, fontWeight: '700' },
  labelFocused: { color: '#00C853' },
});
