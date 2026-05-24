import { HOST_ROUTES } from '@/lib/navigationPaths';
import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** Legacy restaurant order path → canonical `(host)/orders/[id]`. */
export default function LegacyRestaurantOrderRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = typeof id === 'string' ? id.trim() : '';
  if (!orderId) {
    return <Redirect href={HOST_ROUTES.orders} />;
  }
  return <Redirect href={HOST_ROUTES.order(orderId)} />;
}
