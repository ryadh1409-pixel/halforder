import SwipeExploreFeed from '@/components/SwipeExploreFeed';
import SwipeWrapper from '@/components/SwipeWrapper';
import React from 'react';

export default function ExploreTab() {
  return (
    <SwipeWrapper currentIndex={1}>
      <SwipeExploreFeed />
    </SwipeWrapper>
  );
}
