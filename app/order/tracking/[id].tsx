import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** Canonical tracking lives at `/order/[id]` — keep legacy URLs working. */
export default function LegacyOrderTrackingRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const oid = typeof id === 'string' ? id.trim() : '';
  if (!oid) {
    return <Redirect href="/(tabs)/orders" />;
  }
  return <Redirect href={`/order/${oid}`} />;
}
