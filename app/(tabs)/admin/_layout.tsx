import { adminColors as COLORS } from '@/constants/adminTheme';
import { requireRole } from '@/utils/requireRole';
import { Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function AdminLayout() {
  const { loading, authorized } = requireRole(['admin']);

  /** Wrong-role UI only; root `/` role landing is handled by `RoleRouteGuard` in `app/_layout.tsx`. */
  if (loading || !authorized) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: COLORS.background,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: COLORS.background,
        },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
      <Stack.Screen
        name="food-templates"
        options={{ title: 'Food catalog' }}
      />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="food-card/[id]" options={{ title: 'Food card' }} />
      <Stack.Screen name="users" options={{ title: 'Users' }} />
      <Stack.Screen name="user/[id]" options={{ title: 'User' }} />
      <Stack.Screen name="orders" options={{ title: 'Orders' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
      <Stack.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports' }} />
      <Stack.Screen name="report/[id]" options={{ title: 'Report' }} />
      <Stack.Screen name="complaints" options={{ title: 'User Complaints' }} />
      <Stack.Screen
        name="notifications"
        options={{ title: 'Notification Tracking' }}
      />
      <Stack.Screen name="map" options={{ title: 'Activity Map' }} />
      <Stack.Screen name="broadcast" options={{ title: 'Send notification' }} />
      <Stack.Screen name="ai-insights" options={{ title: 'AI Insights' }} />
      <Stack.Screen name="chat-moderation" options={{ title: 'Chat moderation' }} />
      <Stack.Screen name="payments/index" options={{ title: 'Payments' }} />
      <Stack.Screen name="payments/[paymentId]" options={{ title: 'Payment' }} />
      <Stack.Screen name="revenue/index" options={{ title: 'Revenue' }} />
      <Stack.Screen name="payouts" options={{ title: 'Payouts' }} />
      <Stack.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Stack.Screen name="stripe-diagnostics" options={{ title: 'Stripe setup' }} />
      <Stack.Screen
        name="promotion-badges"
        options={{ title: 'Promotion Badges' }}
      />
      <Stack.Screen
        name="restaurant-fees"
        options={{ title: 'Restaurant Fees' }}
      />
      <Stack.Screen name="promo-codes" options={{ title: 'Promo Codes' }} />
      <Stack.Screen name="balances" options={{ title: 'Balances' }} />
      <Stack.Screen name="home-banners" options={{ title: 'Home Banners' }} />
      <Stack.Screen name="vouchers" options={{ title: 'Voucher Management' }} />
      <Stack.Screen
        name="emo-ai-reports/index"
        options={{ title: 'Emo AI Reports' }}
      />
      <Stack.Screen
        name="emo-ai-reports/[reportId]"
        options={{ title: 'Emo AI Report' }}
      />
      <Stack.Screen
        name="inbox-messages"
        options={{ title: 'Inbox Messages' }}
      />
      <Stack.Screen name="finance/index" options={{ title: 'Finance' }} />
      <Stack.Screen
        name="support-inbox/index"
        options={{ title: 'Support Inbox' }}
      />
      <Stack.Screen
        name="support-inbox/[threadId]"
        options={{ title: 'Conversation' }}
      />
      <Stack.Screen
        name="onboarding-manager"
        options={{ title: 'Onboarding Manager' }}
      />
      <Stack.Screen
        name="push-center"
        options={{ title: 'Push Center' }}
      />
      <Stack.Screen
        name="notification-history"
        options={{ title: 'Notification History' }}
      />
      <Stack.Screen
        name="restaurant-management"
        options={{ title: 'Restaurant Management' }}
      />
      <Stack.Screen
        name="driver-management"
        options={{ title: 'Driver Management' }}
      />
      <Stack.Screen
        name="test-order-flow"
        options={{ title: 'Order Flow Test' }}
      />
    </Stack>
  );
}
