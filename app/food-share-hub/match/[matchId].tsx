import { FoodShareHubDetailScreen } from '@/components/ordersHub/FoodShareHubDetailScreen';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';

export default function FoodShareHubMatchDetailRoute() {
  const { matchId } = useLocalSearchParams<{ matchId?: string }>();
  const id = typeof matchId === 'string' ? matchId.trim() : '';
  return <FoodShareHubDetailScreen kind="match" id={id} />;
}
