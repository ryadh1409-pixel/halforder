import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** Old path `/order/checkout` → `/checkout` (root stack, outside tabs). */
export default function OrderCheckoutRedirect() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === 'string' ? orderId.trim() : '';
  if (!id) {
    return <Redirect href="/(tabs)" />;
  }
  return (
    <Redirect
      href={{
        pathname: '/checkout',
        params: { orderId: id },
      }}
    />
  );
}
