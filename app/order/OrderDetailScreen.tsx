import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import { RoleScopedOrderDetailGateway } from '@/components/layout/RoleScopedOrderDetailGateway';
import {
  PaymentNavigationBoundary,
  PostPaymentLoadingShell,
} from '@/components/payment/PaymentNavigationBoundary';
import { CustomerOrderDetailsScreen } from '@/components/orders/customer/CustomerOrderDetailsScreen';
import { DriverOrderDetailsScreen } from '@/components/orders/driver/DriverOrderDetailsScreen';
import { RestaurantOrderDetailsScreen } from '@/components/orders/restaurant/RestaurantOrderDetailsScreen';
import { normalizeOrderRouteId } from '@/lib/orderRouteParams';
import { useMarketplaceOrderDetail } from '@/hooks/useMarketplaceOrderDetail';
import HalfOrderDetailsScreen from '@/screens/HalfOrderDetailsScreen';
import { useAuth } from '@/services/AuthContext';
import { looksLikeMarketplaceRestaurantOrder } from '@/services/orderService';
import { resolveMarketplaceOrderViewerRole } from '@/services/orderViewerRole';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BG = '#06080C';
const BLUE = '#1A6FE8';
const GRAY = '#94A3B8';

function OrderDetailErrorShell({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle: string;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.errorRoot, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorSub}>{subtitle}</Text>
      {onBack ? (
        <Pressable style={styles.retryBtn} onPress={onBack}>
          <Text style={styles.retryBtnText}>Go back</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OrderDetailScreen() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();
  const detail = useMarketplaceOrderDetail('order/[id]');

  if (detail.phase === 'missing_id') {
    return (
      <OrderDetailErrorShell
        title="Missing order"
        subtitle="This link does not include an order id."
        onBack={() => router.back()}
      />
    );
  }

  if (detail.phase === 'loading') {
    return (
      <PostPaymentLoadingShell
        title="Loading your order…"
        subtitle={`Order ${detail.orderId}`}
      />
    );
  }

  if (detail.phase === 'map_error') {
    return (
      <OrderDetailErrorShell
        title="Could not load order"
        subtitle={detail.message}
        onBack={() => router.back()}
      />
    );
  }

  if (detail.phase === 'not_found') {
    return (
      <OrderDetailErrorShell
        title="Order not found"
        subtitle="We could not find this order. It may have been removed."
        onBack={() => router.back()}
      />
    );
  }

  const { order, orderId } = detail;

  if (!detail.isMarketplace && !looksLikeMarketplaceRestaurantOrder(order)) {
    return <HalfOrderDetailsScreen orderId={orderId} />;
  }

  const viewerRole = resolveMarketplaceOrderViewerRole(order, user?.uid, firestoreUserRole);

  if (viewerRole === 'driver') {
    return <DriverOrderDetailsScreen order={order} />;
  }

  if (viewerRole === 'restaurant') {
    if (!isOrderFresh(order)) {
      return (
        <OrderDetailErrorShell
          title="Order no longer available"
          subtitle="Restaurant dashboards only show orders from the last 24 hours."
          onBack={() => router.back()}
        />
      );
    }
    return <RestaurantOrderDetailsScreen order={order} />;
  }

  return <CustomerOrderDetailsScreen order={order} />;
}

export function OrderDetailRouteRoot() {
  return (
    <PaymentNavigationBoundary screenName="order/[id]">
      <RoleScopedOrderDetailGateway>
        <OrderDetailScreen />
      </RoleScopedOrderDetailGateway>
    </PaymentNavigationBoundary>
  );
}

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#F8FAFC' },
  errorSub: { marginTop: 8, fontSize: 14, color: GRAY, fontWeight: '500', lineHeight: 20 },
  retryBtn: {
    marginTop: 20,
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: BLUE,
  },
  retryBtnText: { color: '#FFF', fontWeight: '700' },
});
