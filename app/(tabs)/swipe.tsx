import { SwipeDiscoveryScreen } from '@/components/swipe';
import { usePageTracking } from '@/hooks/usePageTracking';
import React from 'react';

/** Viral split-order discovery — swipe food, match, checkout together. */
export default function SwipeTab() {
  usePageTracking('swipe_discovery');
  return <SwipeDiscoveryScreen />;
}
