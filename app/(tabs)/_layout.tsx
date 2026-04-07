import { HapticTab } from '@/components/haptic-tab';
import { userNeedsEmailVerification } from '@/lib/authEmailVerification';
import { useAuth } from '@/services/AuthContext';
import { Tabs, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
  const { user } = useAuth();
  const router = useRouter();
  const emailBlocked = userNeedsEmailVerification(user);

  const tabs = (
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
      <Tabs.Screen name="browse" options={{ href: null }} />
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
