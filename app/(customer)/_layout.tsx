import { Stack } from 'expo-router';
import React from 'react';

/** Customer-only navigation shell (tracking, post-checkout). Main discovery stays in `(tabs)`. */
export default function CustomerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: '#020617' },
      }}
    />
  );
}
