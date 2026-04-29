import { HapticTab } from '@/components/haptic-tab';
import { userNeedsEmailVerification } from '@/lib/authEmailVerification';
import { useAuth } from '@/services/AuthContext';
import { Tabs, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const TAB_ICON_SIZE = 26;
const TAB_ACTIVE = '#FFFFFF';
const TAB_INACTIVE = '#B0B0B0';

const tabBarDark = {
  backgroundColor: '#0A0A0A',
  borderTopColor: 'rgba(255,255,255,0.1)',
  paddingTop: 8,
  height: 62,
};

const tabBarLabelStyle = {
  fontSize: 13,
  fontWeight: '600' as const,
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
        size={TAB_ICON_SIZE}
        color={focused ? TAB_ACTIVE : inactiveColor}
      />
    </View>
  );
}

const overlayStyles = StyleSheet.create({
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(251, 191, 36, 0.35)',
  },
  verifyBannerText: {
    color: '#FDE68A',
    fontSize: 14,
    fontWeight: '600',
  },
  blockLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});

const styles = StyleSheet.create({
  aiIconWrap: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  aiIconWrapFocused: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
});

export default function TabLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const emailBlocked = userNeedsEmailVerification(user);

  const tabs = (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TAB_ACTIVE,
        tabBarInactiveTintColor: TAB_INACTIVE,
        tabBarStyle: tabBarDark,
        tabBarLabelStyle: tabBarLabelStyle,
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
      <Tabs.Screen name="browse" options={{ href: null }} />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'AI',
          tabBarIcon: ({ focused, color }) => (
            <AITabIcon focused={focused} inactiveColor={color} />
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
        name="food-trucks"
        options={{
          title: 'Trucks',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="local-shipping" size={TAB_ICON_SIZE} color={color} />
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

  if (!emailBlocked) {
    return tabs;
  }

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        style={overlayStyles.verifyBanner}
        onPress={() =>
          router.push('/verify-email' as Parameters<typeof router.push>[0])
        }
      >
        <MaterialIcons name="mark-email-unread" size={18} color="#FBBF24" />
        <Text style={overlayStyles.verifyBannerText}>Email not verified · Tap to verify</Text>
      </Pressable>
      <View style={{ flex: 1 }} pointerEvents="box-none">
        {tabs}
        <Pressable
          style={overlayStyles.blockLayer}
          onPress={() =>
            router.push('/verify-email' as Parameters<typeof router.push>[0])
          }
        />
      </View>
    </View>
  );
}
