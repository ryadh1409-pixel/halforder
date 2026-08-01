import { UberEatsHomeScreen } from '@/components/home/UberEatsHomeScreen';
import { usePageTracking } from '@/hooks/usePageTracking';
import React from 'react';

/** Replaces legacy Food Trucks demo — same premium home as main tab. */
export default function HomeFoodTrucksTab() {
  usePageTracking('home');
  return <UberEatsHomeScreen />;
}
