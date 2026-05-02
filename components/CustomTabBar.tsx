import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

const ACTIVE = '#FF6B6B';
const INACTIVE = '#777';

function iconGlyph(
  routeName: string,
  focused: boolean,
): keyof typeof Ionicons.glyphMap {
  const pick = (on: keyof typeof Ionicons.glyphMap, off: keyof typeof Ionicons.glyphMap) =>
    (focused ? on : off) as keyof typeof Ionicons.glyphMap;

  switch (routeName) {
    case 'index':
      return pick('home', 'home-outline');
    case 'ai':
      return pick('sparkles', 'sparkles-outline');
    case 'orders':
      return pick('receipt', 'receipt-outline');
    case 'trucks':
      return pick('car', 'car-outline');
    case 'profile':
      return pick('person', 'person-outline');
    default:
      return 'ellipse';
  }
}

type ItemProps = {
  route: BottomTabBarProps['state']['routes'][number];
  focused: boolean;
  navigation: BottomTabBarProps['navigation'];
};

/**
 * One tab = one hook instance (Reanimated). Do not call hooks inside `routes.map` in the parent.
 */
function TabBarItem({ route, focused, navigation }: ItemProps) {
  const scale = useSharedValue(focused ? 1.06 : 1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.06 : 1, { damping: 16, stiffness: 220 });
  }, [focused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPress = useCallback(() => {
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
  }, [focused, navigation, route.key, route.name, scale]);

  const iconName = iconGlyph(route.name, focused);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={route.name}
      onPress={onPress}
      style={styles.tab}
    >
      <Animated.View
        style={[styles.iconContainer, focused && styles.activeTab, animatedStyle]}
      >
        <Ionicons name={iconName} size={24} color={focused ? ACTIVE : INACTIVE} />
      </Animated.View>
    </Pressable>
  );
}

export default function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.container}>
      {state.routes.map((route, index) => (
        <TabBarItem
          key={route.key}
          route={route}
          focused={state.index === index}
          navigation={navigation}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    backgroundColor: '#0B0B0B',
    borderRadius: 20,
    height: 65,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  activeTab: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
});
