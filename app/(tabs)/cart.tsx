import { CartHubScreen } from '@/components/cart/CartHubScreen';
import { usePageTracking } from '@/hooks/usePageTracking';
import React from 'react';

export default function CartTab() {
  usePageTracking('cart');
  return <CartHubScreen />;
}
