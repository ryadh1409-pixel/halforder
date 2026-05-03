import SwipeExploreFeed from '@/components/SwipeExploreFeed';
import SwipeWrapper from '@/components/SwipeWrapper';
import React from 'react';

export default function HomeTab() {
  return (
    <SwipeWrapper currentIndex={0}>
      <SwipeExploreFeed />
    </SwipeWrapper>
  );
}
