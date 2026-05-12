import { Stack } from 'expo-router';
import React from 'react';

/** Shell only — no listeners, redirects, or state (avoids navigation/render churn). */
export default function DriverLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}
