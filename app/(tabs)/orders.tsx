import SwipeWrapper from '@/components/SwipeWrapper';
import MarketplaceOrdersScreen from '@/screens/MarketplaceOrdersScreen';
import React from 'react';

export default function OrdersTab() {
  return (
    <SwipeWrapper currentIndex={3}>
      <MarketplaceOrdersScreen />
    </SwipeWrapper>
  );
}
