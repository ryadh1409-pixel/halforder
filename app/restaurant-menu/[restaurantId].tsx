import { RestaurantDetailsScreen } from '@/components/restaurant/RestaurantDetailsScreen';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function RestaurantMenuScreen() {
  const params = useLocalSearchParams<{ restaurantId: string }>();
  const restaurantId = typeof params.restaurantId === 'string' ? params.restaurantId : '';
  if (!restaurantId) {
    return null;
  }
  return <RestaurantDetailsScreen restaurantId={restaurantId} />;
}
