import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** Legacy route — always use premium restaurant storefront. */
export default function FoodTruckRedirect() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const restaurantId = typeof id === 'string' ? id : '';
  if (!restaurantId) {
    return <Redirect href="/(tabs)" />;
  }
  return (
    <Redirect href={`/restaurant-menu/${encodeURIComponent(restaurantId)}`} />
  );
}
