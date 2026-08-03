/**
 * Orchestrates Home Active Order Card vs floating tracking bubble.
 * Presentation-only — reuses useHomeActiveDelivery + existing track-order route.
 *
 * Wraps the home feed so the card stays pinned under the header, the bubble
 * overlays bottom-right, and Firestore listeners mount once.
 */
import { ActiveOrderCard } from '@/components/home/ActiveOrderCard';
import { FloatingTrackingBubble } from '@/components/home/FloatingTrackingBubble';
import { useHomeActiveDelivery } from '@/hooks/useHomeActiveDelivery';
import { useLiveDeliveryRoute } from '@/hooks/useLiveDeliveryRoute';
import { driverDisplayInitials } from '@/lib/driverDisplayInitials';
import {
  readDismissedHomeActiveOrders,
  setHomeActiveOrderDismissed,
} from '@/lib/homeActiveDeliveryDismiss';
import { stableMapLatLng } from '@/lib/maps/stableMapLatLng';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  children: React.ReactNode;
};

export function HomeActiveDeliveryChrome({ children }: Props) {
  const router = useRouter();
  const { orderId, order, statusLabel, loading } = useHomeActiveDelivery();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readDismissedHomeActiveOrders().then((set) => {
      if (!cancelled) {
        setDismissedIds(set);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // When active order changes or ends, drop dismiss flags for other/stale ids.
  useEffect(() => {
    if (!hydrated) return;
    setDismissedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      if (orderId && prev.has(orderId)) next.add(orderId);
      if (next.size === prev.size && [...prev].every((id) => next.has(id))) {
        return prev;
      }
      void (async () => {
        const stored = await readDismissedHomeActiveOrders();
        for (const id of [...stored]) {
          if (id !== orderId) await setHomeActiveOrderDismissed(id, false);
        }
      })();
      return next;
    });
  }, [hydrated, orderId]);

  const collapsed = Boolean(orderId && dismissedIds.has(orderId));

  const driverCoord = useMemo(
    () =>
      stableMapLatLng(order?.driverLocation?.lat, order?.driverLocation?.lng),
    [order?.driverLocation?.lat, order?.driverLocation?.lng],
  );
  const restaurantCoord = useMemo(
    () =>
      stableMapLatLng(
        order?.restaurantLocation?.lat,
        order?.restaurantLocation?.lng,
      ),
    [order?.restaurantLocation?.lat, order?.restaurantLocation?.lng],
  );
  const customerCoord = useMemo(
    () =>
      stableMapLatLng(
        order?.deliveryLocation?.lat,
        order?.deliveryLocation?.lng,
      ),
    [order?.deliveryLocation?.lat, order?.deliveryLocation?.lng],
  );

  const route = useLiveDeliveryRoute({
    enabled: Boolean(order && collapsed),
    driver: driverCoord,
    restaurant: restaurantCoord,
    customer: customerCoord,
    kitchenStatus: order?.status,
    deliveryStatus: order?.deliveryStatus,
  });

  const openTracking = useCallback(() => {
    if (!orderId) return;
    router.push(USER_ROUTES.trackOrder(orderId) as never);
  }, [orderId, router]);

  const onDismissCard = useCallback(() => {
    if (!orderId) return;
    setDismissedIds((prev) => new Set([...prev, orderId]));
    void setHomeActiveOrderDismissed(orderId, true);
  }, [orderId]);

  const avatarUri =
    typeof order?.driver?.avatar === 'string' ? order.driver.avatar : null;
  const driverName =
    order?.driver?.name?.trim() || order?.driverName?.trim() || 'Driver';
  const initials = useMemo(
    () => driverDisplayInitials(driverName),
    [driverName],
  );

  const etaLabel =
    typeof route.etaMinutes === 'number' && Number.isFinite(route.etaMinutes)
      ? `${route.etaMinutes} min`
      : statusLabel;

  const showCard =
    hydrated && !loading && Boolean(orderId && order && statusLabel) && !collapsed;
  const showBubble =
    hydrated && Boolean(orderId && order && statusLabel) && collapsed;

  return (
    <View style={styles.root}>
      {showCard && order && statusLabel ? (
        <ActiveOrderCard
          order={order}
          statusLabel={statusLabel}
          onOpenTracking={openTracking}
          onDismiss={onDismissCard}
        />
      ) : null}
      <View style={styles.feed}>{children}</View>
      <FloatingTrackingBubble
        visible={showBubble}
        etaLabel={etaLabel}
        avatarUri={avatarUri}
        initials={initials}
        onPress={openTracking}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  feed: { flex: 1 },
});
