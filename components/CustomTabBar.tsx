import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { memo, useCallback, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

const ACTIVE = '#FF6B6B';
const INACTIVE = '#777';

const HIDDEN_TAB_NAMES = new Set<string>(['admin']);

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
  navigation: BottomTabBarProps['navigation'];
};

const TabBarItem = memo(function TabBarItem({ route, focused, navigation }: ItemProps) {
  const scale = useSharedValue(focused ? 1.06 : 1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.06 : 1, { damping: 16, stiffness: 220 });
  }, [focused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPress = useCallback(() => {
    if (!navigation || !route?.key || !route?.name) return;
    try {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      scale.value = withSequence(
        withSpring(1.14, { damping: 10, stiffness: 420 }),
        withSpring(focused ? 1.06 : 1.06, { damping: 14, stiffness: 260 }),
      );

      if (!event.defaultPrevented) {
        navigation.navigate(route.name as never);
      }
    } catch (e) {
      console.warn('[CustomTabBar] tabPress', e);
      try {
        navigation.navigate(route.name as never);
      } catch (navErr) {
        console.warn('[CustomTabBar] navigate', navErr);
      }
    }
  }, [focused, navigation, route.key, route.name, scale]);

  const iconName = iconGlyph(route?.name ?? '', focused);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={route?.name ?? 'tab'}
      onPress={onPress}
      style={styles.tab}
    >
      <Animated.View
        style={[styles.iconContainer, focused && styles.activeTab, animatedStyle]}
      >
        <Ionicons name={iconName} size={22} color={focused ? ACTIVE : INACTIVE} />
      </Animated.View>
    </Pressable>
  );
});

export type CustomTabBarProps = BottomTabBarProps & {
  resolvedRole?: string;
};

function CustomTabBarInner(props: CustomTabBarProps) {
  const insets = useSafeAreaInsets();

  if (!props || !props.state || !props.state.routes) {
    return null;
  }

  const { state, navigation } = props ?? {};
  if (!state || !navigation) {
    return null;
  }

  const routes = state?.routes ?? [];
  if (routes.length === 0) {
    return null;
  }

  const tabIndex = state?.index ?? 0;
  const stale = state?.stale ?? false;
  void stale;

  const role = props?.resolvedRole ?? 'user';

  return (
    <View
      key={role}
      style={[styles.container, { bottom: Math.max(10, 8 + insets.bottom) }]}
    >
      {state.routes?.map((route, index) => {
        if (!route) return null;
        if (!route.name) return null;
        if (HIDDEN_TAB_NAMES.has(route.name)) return null;
        if (route.name === 'host' && role !== 'restaurant') return null;
        if (route.name === 'driver' && role !== 'driver' && role !== 'admin')
          return null;
        if (!route.key) return null;

        const focused = tabIndex === index;
        return (
          <TabBarItem
            key={route.key}
            route={route}
            focused={focused}
            navigation={navigation}
          />
        );
      })}
    </View>
  );
}

export default memo(CustomTabBarInner);

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
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowOffset: { width: 0, height: 5 },
        shadowRadius: 10,
      },
      default: { elevation: 10 },
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
