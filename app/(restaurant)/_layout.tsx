import { Stack } from 'expo-router';
import React from 'react';

/** Restaurant deep links — primary shell is `(host)`; legacy `(tabs)/host` redirects here. */
export default function RestaurantLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#020617' },
      }}
    />
  );
}
