import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/services/AuthContext';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { type Href, useRouter } from 'expo-router';
import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { platformElevation } from '@/utils/platformElevation';

/**
 * Custom bottom tab bar — visuals + role filtering only.
 * Tab changes: **only** `Pressable.onPress` → `router.navigate(href)` (Expo Router).
 * No `useEffect`, no loops that navigate, no prefetch, no `navigation.navigate` outside press.
 */
const ACTIVE = '#FF6B6B';
const INACTIVE = '#777';

const HIDDEN_TAB_NAMES = new Set<string>(['admin']);

/** Stable `href` for each `(tabs)` screen name (Expo Router file routes). */
function hrefForTabRoute(routeName: string): Href {
  switch (routeName) {
    case 'index':
      return '/(tabs)' as Href;
    case 'explore':
      return '/(tabs)/explore' as Href;
    case 'ai':
      return '/(tabs)/ai' as Href;
    case 'orders':
      return '/(tabs)/orders' as Href;
    case 'home':
      return '/(tabs)/home' as Href;
    case 'profile':
      return '/(tabs)/profile' as Href;
    case 'host':
      return '/(tabs)/host' as Href;
    case 'driver':
      return '/(tabs)/driver' as Href;
    case 'admin':
      return '/(tabs)/admin' as Href;
    default:
      return `/(tabs)/${routeName}` as Href;
  }
}

function iconGlyph(
  routeName: string,
  focused: boolean,
): keyof typeof Ionicons.glyphMap {
  const pick = (on: keyof typeof Ionicons.glyphMap, off: keyof typeof Ionicons.glyphMap) =>
    (focused ? on : off) as keyof typeof Ionicons.glyphMap;

  switch (routeName) {
    case 'index':
      return pick('home', 'home-outline');
    case 'explore':
      return pick('layers', 'layers-outline');
    case 'ai':
      return pick('sparkles', 'sparkles-outline');
    case 'orders':
      return pick('receipt', 'receipt-outline');
    case 'home':
      return pick('car', 'car-outline');
    case 'profile':
      return pick('person', 'person-outline');
    case 'host':
      return pick('storefront', 'storefront-outline');
    case 'driver':
      return pick('navigate-circle', 'navigate-circle-outline');
    default:
      return 'ellipse';
  }
}

type ItemProps = {
  route: BottomTabBarProps['state']['routes'][number];
  focused: boolean;
  href: Href;
};

const TabBarItem = memo(function TabBarItem({ route, focused, href }: ItemProps) {
  const router = useRouter();

  const onPress = useCallback(() => {
    if (!route?.name) return;
    if (focused) return;
    router.navigate(href);
  }, [focused, href, route?.name, router]);

  const iconName = iconGlyph(route?.name ?? '', focused);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={route?.name ?? 'tab'}
      onPress={onPress}
      style={styles.tab}
    >
      <View style={[styles.iconContainer, focused && styles.activeTab]}>
        <Ionicons name={iconName} size={22} color={focused ? ACTIVE : INACTIVE} />
      </View>
    </Pressable>
  );
});

export type CustomTabBarProps = BottomTabBarProps;

function CustomTabBar(props: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { loading, firestoreUserRole } = useAuth();
  const role = useMemo(
    () => (loading ? 'user' : firestoreUserRole ?? 'user'),
    [loading, firestoreUserRole],
  );

  if (!props?.state?.routes) {
    return null;
  }

  const { state } = props;
  const routes = state.routes ?? [];
  if (routes.length === 0) {
    return null;
  }

  const tabIndex = typeof state.index === 'number' ? state.index : 0;

  return (
    <View style={[styles.container, { bottom: Math.max(10, 8 + insets.bottom) }]}>
      {routes.map((route, index) => {
        if (!route) return null;
        if (!route.name) return null;
        if (HIDDEN_TAB_NAMES.has(route.name)) return null;
        if (route.name === 'host' && role !== 'restaurant' && role !== 'host') return null;
        if (route.name === 'driver' && role !== 'driver' && role !== 'admin') return null;
        if (!route.key) return null;

        const isFocused = tabIndex === index;
        const href = hrefForTabRoute(route.name);
        return (
          <TabBarItem
            key={route.key}
            route={route}
            focused={isFocused}
            href={href}
          />
        );
      })}
    </View>
  );
}

export default memo(CustomTabBar);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    backgroundColor: '#0B0B0B',
    borderRadius: 20,
    minHeight: 62,
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 0,
    ...platformElevation({
      web: '0px 5px 10px rgba(0, 0, 0, 0.25)',
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowOffset: { width: 0, height: 5 },
        shadowRadius: 10,
      },
      android: { elevation: 10 },
    }),
  },
  tab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  activeTab: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
});
