import { UE } from '@/constants/uberEatsTheme';
import { adminRoutes } from '@/constants/adminRoutes';
import { TABS_ROUTES } from '@/lib/navigationPaths';
import {
  resolveTabsShellRole,
  visibleTabNamesForRole,
} from '@/lib/tabsRoleVisibility';
import { useAuth } from '@/services/AuthContext';
import { selectCartTotals, useCartStore } from '@/store/cartStore';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { type Href, useRouter } from 'expo-router';
import React, { memo, useCallback, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { platformElevation } from '@/utils/platformElevation';

const ACTIVE = UE.text;
const INACTIVE = UE.textMuted;
const ICON_SIZE = 26;

function hrefForTabRoute(routeName: string): Href {
  switch (routeName) {
    case 'index':
      return TABS_ROUTES.hub as Href;
    case 'explore':
      return TABS_ROUTES.explore as Href;
    case 'search':
      return TABS_ROUTES.orders as Href;
    case 'cart':
      return TABS_ROUTES.cart as Href;
    case 'profile':
      return TABS_ROUTES.profile as Href;
    case 'orders':
      return '/(host)/dashboard' as Href;
    case 'host':
      return '/(host)/dashboard' as Href;
    case 'menu':
      return '/(host)/menu' as Href;
    case 'admin':
      return adminRoutes.home as Href;
    case 'ai':
      return TABS_ROUTES.ai as Href;
    default:
      return `/(tabs)/${routeName}` as Href;
  }
}

function iconGlyph(
  routeName: string,
  focused: boolean,
): keyof typeof Ionicons.glyphMap {
  const pick = (
    on: keyof typeof Ionicons.glyphMap,
    off: keyof typeof Ionicons.glyphMap,
  ) => (focused ? on : off) as keyof typeof Ionicons.glyphMap;

  switch (routeName) {
    case 'index':
      return pick('home', 'home-outline');
    case 'swipe':
      return pick('flame', 'flame-outline');
    case 'explore':
      return pick('grid', 'grid-outline');
    case 'search':
      return pick('receipt', 'receipt-outline');
    case 'cart':
      return pick('bag', 'bag-outline');
    case 'profile':
      return pick('person', 'person-outline');
    case 'orders':
      return pick('receipt', 'receipt-outline');
    case 'host':
      return pick('storefront', 'storefront-outline');
    case 'menu':
      return pick('restaurant', 'restaurant-outline');
    case 'admin':
      return pick('shield', 'shield-outline');
    default:
      return 'ellipse';
  }
}

function tabLabel(routeName: string): string {
  switch (routeName) {
    case 'index':
      return 'Home';
    case 'swipe':
      return 'Swipe';
    case 'explore':
      return 'Browse';
    case 'search':
      return 'Orders';
    case 'cart':
      return 'Cart';
    case 'profile':
      return 'Profile';
    case 'orders':
      return 'Orders';
    case 'host':
      return 'Dashboard';
    case 'menu':
      return 'Menu';
    case 'admin':
      return 'Admin';
    default:
      return routeName;
  }
}

type ItemProps = {
  route: BottomTabBarProps['state']['routes'][number];
  focused: boolean;
  href: Href;
  badge?: number;
};

const TabBarItem = memo(function TabBarItem({
  route,
  focused,
  href,
  badge,
}: ItemProps) {
  const router = useRouter();
  const scale = useSharedValue(1);

  const iconAnim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPress = useCallback(() => {
    if (!route?.name || focused) return;
    router.navigate(href);
  }, [focused, href, route?.name, router]);

  const iconName = iconGlyph(route?.name ?? '', focused);
  const label = tabLabel(route.name);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      onPressIn={() => {
        scale.value = withSpring(0.92, { damping: 16, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 280 });
      }}
      onPress={onPress}
      style={styles.tab}
    >
      <View style={[styles.iconSlot, focused && styles.iconSlotActive]}>
        <Animated.View style={iconAnim}>
          <Ionicons
            name={iconName}
            size={ICON_SIZE}
            color={focused ? ACTIVE : INACTIVE}
          />
        </Animated.View>
        {badge != null && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
});

export type CustomTabBarProps = BottomTabBarProps;

function CustomTabBar(props: CustomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { loading, firestoreUserRole } = useAuth();
  const cartQty = useCartStore((s) => selectCartTotals(s.items).qty);

  const role = useMemo(
    () => resolveTabsShellRole(firestoreUserRole, loading),
    [loading, firestoreUserRole],
  );

  if (!props?.state?.routes?.length) return null;
  if (role === 'driver' || !role) return null;

  const { state } = props;
  const tabIndex = typeof state.index === 'number' ? state.index : 0;
  const activeRoute = state.routes[tabIndex]?.name;

  const visibleTabNames = visibleTabNamesForRole(role);

  const visibleRoutes = visibleTabNames
    .map((name) => state.routes.find((r) => r.name === name))
    .filter(Boolean) as BottomTabBarProps['state']['routes'];

  return (
    <View style={[styles.outer, { bottom: Math.max(14, insets.bottom + 4) }]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={92} tint="light" style={styles.blurFill} />
      ) : null}
      <View
        style={[
          styles.blurFill,
          Platform.OS !== 'ios' && styles.androidFill,
          Platform.OS === 'web' && styles.webFill,
        ]}
      />
      <View style={styles.container}>
        {visibleRoutes.map((route) => {
          if (!route?.key) return null;
          const isFocused = activeRoute === route.name;
          const href = hrefForTabRoute(route.name);
          const badge = route.name === 'cart' ? cartQty : undefined;
          return (
            <TabBarItem
              key={route.key}
              route={route}
              focused={isFocused}
              href={href}
              badge={badge}
            />
          );
        })}
      </View>
    </View>
  );
}

export default memo(CustomTabBar);

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
    ...platformElevation({
      web: '0px 12px 40px rgba(0, 0, 0, 0.14)',
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.14,
        shadowOffset: { width: 0, height: 12 },
        shadowRadius: 28,
      },
      android: { elevation: 16 },
    }),
  },
  blurFill: {
    ...StyleSheet.absoluteFillObject,
  },
  androidFill: {
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  webFill: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    backdropFilter: 'blur(20px)' as never,
  },
  container: {
    flexDirection: 'row',
    minHeight: UE.tabBarHeight,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 0,
    paddingVertical: 2,
  },
  iconSlot: {
    position: 'relative',
    width: 48,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlotActive: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: INACTIVE,
    letterSpacing: -0.1,
  },
  labelActive: { color: ACTIVE, fontWeight: '900' },
  badge: {
    position: 'absolute',
    right: 2,
    top: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: UE.promo,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: UE.bg,
  },
  badgeTxt: { fontSize: 10, fontWeight: '900', color: '#FFF' },
});
