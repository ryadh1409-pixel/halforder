import { isOrderFresh } from '@/lib/restaurantOrderFreshness';
import {
  PostPaymentLoadingShell,
} from '@/components/payment/PaymentNavigationBoundary';
import { CustomerOrderDetailsScreen } from '@/components/orders/customer/CustomerOrderDetailsScreen';
import { DriverOrderDetailsScreen } from '@/components/orders/driver/DriverOrderDetailsScreen';
import { RestaurantOrderDetailsScreen } from '@/components/orders/restaurant/RestaurantOrderDetailsScreen';
import { useMarketplaceOrderDetail } from '@/hooks/useMarketplaceOrderDetail';
import HalfOrderDetailsScreen from '@/screens/HalfOrderDetailsScreen';
import { useAuth } from '@/services/AuthContext';
import { looksLikeMarketplaceRestaurantOrder } from '@/services/orderService';
import { resolveMarketplaceOrderViewerRole } from '@/services/orderViewerRole';
import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BG = '#0B0816';
const BLUE = '#1A6FE8';
const GRAY = '#7D8493';

function HalfOrderWaitingShell({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[waitingStyles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={waitingStyles.title}>Preparing Your Order</Text>
      <Text style={waitingStyles.body}>
        We're getting everything ready for your delivery. Your meal will be freshly
        prepared shortly before delivery to ensure the best quality.
      </Text>
      <Text style={waitingStyles.windowHeading}>Delivery Window</Text>
      <Text style={waitingStyles.windowBody}>
        {'• Before 1:00 PM → 11:00 AM – 1:00 PM\n'}
        {'• 1:00 PM – 6:30 PM → 5:00 PM – 7:00 PM\n'}
        {'• After 6:30 PM → Next day, 11:00 AM – 1:00 PM'}
      </Text>
      <ActivityIndicator size="small" color="#C084FC" style={waitingStyles.spinner} />
      <Text style={waitingStyles.footer}>
        Delivery tracking will appear automatically once your order is ready.
      </Text>
      {onBack ? (
        <Pressable style={[styles.retryBtn, { backgroundColor: GRAY }]} onPress={onBack}>
          <Text style={styles.retryBtnText}>Go back</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

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

/** Marketplace / half-order detail body for `app/order/[id].tsx` (not an Expo route). */
export default function OrderDetailScreen() {
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
    // HalfOrder matchIds always contain '_'; Firestore auto-IDs never do.
    if (detail.orderId.includes('_')) {
      return <HalfOrderWaitingShell onBack={() => router.back()} />;
    }
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

const styles = StyleSheet.create({
  errorRoot: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  errorTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
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

const waitingStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 10,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  body: { fontSize: 14, color: GRAY, fontWeight: '500', lineHeight: 20 },
  windowHeading: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  windowBody: { fontSize: 13, color: GRAY, lineHeight: 20 },
  spinner: { marginTop: 6, alignSelf: 'flex-start' },
  footer: { fontSize: 11, color: GRAY, fontStyle: 'italic', marginTop: 2 },
});
