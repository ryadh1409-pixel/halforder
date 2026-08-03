/**
 * Uber Eats–style home Active Order Card — presentation only.
 * Tap → existing /track-order/{id}. Data from useHomeActiveDelivery / live order.
 */
import { CustomerTrackingMap } from '@/components/maps/CustomerTrackingMap';
import { UE } from '@/constants/uberEatsTheme';
import { customerTrackProgress, resolveCustomerTrackStep } from '@/lib/customerTrackStatus';
import { driverDisplayInitials } from '@/lib/driverDisplayInitials';
import { stableMapLatLng } from '@/lib/maps/stableMapLatLng';
import { useLiveDeliveryRoute } from '@/hooks/useLiveDeliveryRoute';
import type { RestaurantOrder } from '@/services/orderService';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type Props = {
  order: RestaurantOrder;
  statusLabel: string;
  onOpenTracking: () => void;
  onDismiss: () => void;
};

export function ActiveOrderCard({
  order,
  statusLabel,
  onOpenTracking,
  onDismiss,
}: Props) {
  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = withSpring(1, { damping: 16, stiffness: 180 });
  }, [appear]);

  const anim = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ translateY: (1 - appear.value) * -16 }],
  }));

  const driverCoord = useMemo(
    () =>
      stableMapLatLng(order.driverLocation?.lat, order.driverLocation?.lng),
    [order.driverLocation?.lat, order.driverLocation?.lng],
  );
  const restaurantCoord = useMemo(
    () =>
      stableMapLatLng(
        order.restaurantLocation?.lat ?? order.restaurant.latitude,
        order.restaurantLocation?.lng ?? order.restaurant.longitude,
      ),
    [
      order.restaurantLocation?.lat,
      order.restaurantLocation?.lng,
      order.restaurant.latitude,
      order.restaurant.longitude,
    ],
  );
  const customerCoord = useMemo(
    () =>
      stableMapLatLng(order.deliveryLocation?.lat, order.deliveryLocation?.lng),
    [order.deliveryLocation?.lat, order.deliveryLocation?.lng],
  );

  const route = useLiveDeliveryRoute({
    enabled: true,
    driver: driverCoord,
    restaurant: restaurantCoord,
    customer: customerCoord,
    kitchenStatus: order.status,
    deliveryStatus: order.deliveryStatus,
  });

  const step = resolveCustomerTrackStep(order);
  const progress = customerTrackProgress(step);
  const driverName =
    order.driver?.name?.trim() ||
    order.driverName?.trim() ||
    (order.driverId || order.assignedDriverId ? 'Your driver' : 'Finding a driver');
  const avatarUri =
    typeof order.driver?.avatar === 'string' ? order.driver.avatar : null;
  const pin = order.deliveryPin;
  const eta =
    typeof route.etaMinutes === 'number' && Number.isFinite(route.etaMinutes)
      ? `${route.etaMinutes} min`
      : null;

  return (
    <Animated.View style={[styles.wrap, anim]}>
      <View style={styles.card}>
        <Pressable
          style={styles.mapSlot}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenTracking();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open live order tracking"
        >
          <CustomerTrackingMap
            order={order}
            routeCoordinates={route.coordinates}
            etaMinutes={route.etaMinutes}
            lite
          />
        </Pressable>

        <Pressable
          style={styles.body}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onOpenTracking();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Active order: ${statusLabel}`}
        >
          <View style={styles.topRow}>
            <View style={styles.driverBlock}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarTxt}>
                    {driverDisplayInitials(driverName)}
                  </Text>
                </View>
              )}
              <View style={styles.titles}>
                <Text style={styles.status} numberOfLines={1}>
                  {statusLabel}
                </Text>
                <Text style={styles.restaurant} numberOfLines={1}>
                  {order.restaurant.name}
                </Text>
                <Text style={styles.driver} numberOfLines={1}>
                  {driverName}
                </Text>
              </View>
            </View>

            <View style={styles.trailing}>
              {eta ? (
                <View style={styles.etaPill}>
                  <Text style={styles.etaTxt}>{eta}</Text>
                </View>
              ) : null}
              <Pressable
                hitSlop={12}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onDismiss();
                }}
                style={styles.dismiss}
                accessibilityRole="button"
                accessibilityLabel="Minimize active order"
              >
                <Ionicons name="chevron-down" size={20} color={UE.textMuted} />
              </Pressable>
            </View>
          </View>

          <View
            style={styles.progressTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round(progress * 100),
            }}
          >
            <View
              style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
            />
          </View>

          {pin ? (
            <View style={styles.pinRow}>
              <Text style={styles.pinLabel}>Delivery PIN</Text>
              <Text style={styles.pinValue}>{pin}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: UE.spaceBlock,
  },
  card: {
    borderRadius: UE.radiusXL,
    backgroundColor: UE.surfaceElevated,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UE.border,
    shadowColor: UE.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  mapSlot: {
    height: 128,
    backgroundColor: UE.surface,
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  driverBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: UE.surface,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.18)',
  },
  avatarTxt: {
    color: UE.accent,
    fontWeight: '800',
    fontSize: 15,
  },
  titles: { flex: 1, minWidth: 0 },
  status: {
    fontSize: 15,
    fontWeight: '800',
    color: UE.text,
    letterSpacing: -0.2,
  },
  restaurant: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: UE.textSecondary,
  },
  driver: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: '500',
    color: UE.textMuted,
  },
  trailing: { alignItems: 'flex-end', gap: 6 },
  etaPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: UE.radiusPill,
    backgroundColor: UE.accent,
  },
  etaTxt: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  dismiss: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UE.surface,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: UE.borderLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: UE.accent,
  },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pinLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: UE.textMuted,
  },
  pinValue: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 3,
    color: UE.text,
  },
});
