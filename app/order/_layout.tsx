import { Stack } from 'expo-router';
import React, { useEffect } from 'react';

/** All screens under `app/order/` — do not hand-pick routes (omitting `[id]` caused blank screens). */
export default function OrderLayout() {
  useEffect(() => {
    if (__DEV__) {
      console.log('[ORDER LAYOUT] mounted');
    }
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#09090B' },
      }}
    />
  );
}
