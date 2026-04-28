import { HapticTab } from '@/components/haptic-tab';
import { userNeedsEmailVerification } from '@/lib/authEmailVerification';
import { useAuth } from '@/services/AuthContext';
import { Tabs, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name="home-filled"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: 'Deals',
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name="local-offer"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="food-trucks"
        options={{
          title: 'Food Trucks',
          tabBarIcon: ({ color }) => (
            <MaterialIcons
              name="local-shipping"
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen name="browse" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="orders" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
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
        <Text style={overlayStyles.verifyBannerText}>
          Email not verified · Tap to verify
        </Text>
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
