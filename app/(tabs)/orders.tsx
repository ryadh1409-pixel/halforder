import SwipeWrapper from '@/components/SwipeWrapper';
import React from 'react';
import OrdersScreen from '../../screens/OrdersScreen';

export default function OrdersTab() {
  return (
    <SwipeWrapper currentIndex={2}>
      <OrdersScreen />
    </SwipeWrapper>
  );
}
