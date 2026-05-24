import SwipeWrapper from '@/components/SwipeWrapper';
import MarketplaceOrdersScreen from '@/screens/MarketplaceOrdersScreen';

export default function HostOrdersRoute() {
  return (
    <SwipeWrapper currentIndex={0}>
      <MarketplaceOrdersScreen />
    </SwipeWrapper>
  );
}
