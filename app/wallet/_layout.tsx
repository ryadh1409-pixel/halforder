import { Stack } from 'expo-router';
import React from 'react';

/** Native iOS-style push stack for Wallet → Add Payment Method → Card. */
export default function WalletLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="add-payment-method" />
      <Stack.Screen name="card/[id]" />
    </Stack>
  );
}
