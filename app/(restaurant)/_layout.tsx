import { Stack } from 'expo-router';
import React from 'react';

/** Restaurant / host operations — primary UI remains `(tabs)/host`; this group is for future deep links. */
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
