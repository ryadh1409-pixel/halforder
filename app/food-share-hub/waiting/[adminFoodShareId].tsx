import { FoodShareHubDetailScreen } from '@/components/ordersHub/FoodShareHubDetailScreen';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function FoodShareHubWaitingDetailRoute() {
  const { adminFoodShareId } = useLocalSearchParams<{ adminFoodShareId?: string }>();
  const id = typeof adminFoodShareId === 'string' ? adminFoodShareId.trim() : '';
  return <FoodShareHubDetailScreen kind="waiting" id={id} />;
}
