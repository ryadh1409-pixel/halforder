import { Tabs } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';

const TAB_ICON_SIZE = 24;
const TAB_ACTIVE = '#34D399';
const TAB_INACTIVE = 'rgba(255,255,255,0.45)';
const AI_TAB_ACTIVE = '#6EE7B7';

const tabBarDark = {
  backgroundColor: '#0B0E14',
  borderTopColor: 'rgba(255,255,255,0.08)',
  paddingTop: 6,
  height: 58,
};

function AITabIcon({
  focused,
  inactiveColor,
}: {
  focused: boolean;
  inactiveColor: string;
}) {
  return (
    <View
      style={[
        styles.aiIconWrap,
        focused && styles.aiIconWrapFocused,
        Platform.OS === 'android' && focused ? { elevation: 6 } : null,
      ]}
    >
      <MaterialIcons
        name="auto-awesome"
        size={TAB_ICON_SIZE - 1}
        color={focused ? AI_TAB_ACTIVE : inactiveColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  aiIconWrap: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  aiIconWrapFocused: {
    backgroundColor: 'rgba(52, 211, 153, 0.18)',
    shadowColor: '#34D399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
  },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TAB_ACTIVE,
        tabBarInactiveTintColor: TAB_INACTIVE,
        tabBarStyle: tabBarDark,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Swipe',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="style" size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name="grid-view"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'AI',
          tabBarActiveTintColor: AI_TAB_ACTIVE,
          tabBarIcon: ({ focused, color }) => (
            <AITabIcon focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name="receipt-long"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name="person-outline"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="create" options={{ href: null }} />
      <Tabs.Screen name="join" options={{ href: null }} />
    </Tabs>
  );
}
