/**
 * Full-screen track-order presentation shell.
 * Receives already-resolved order/UI/ETA props — no business logic here.
 */
import { DeliveryStatusHeader } from '@/components/tracking/DeliveryStatusHeader';
import { TrackingActionBar } from '@/components/tracking/TrackingActionBar';
import { TrackingBottomSheet } from '@/components/tracking/TrackingBottomSheet';
import { DriverVehicleInfoCard } from '@/components/delivery/DriverVehicleInfoCard';
import { CustomerTrackingMap } from '@/components/maps/CustomerTrackingMap';
import { CustomerMarketplaceTimeline } from '@/components/order/CustomerMarketplaceTimeline';
import { IWantTimeline } from '@/components/iWant/IWantTimeline';
import { UE } from '@/constants/uberEatsTheme';
import { isIWantOrder } from '@/lib/iWantTimeline';
import { EMPTY_DRIVER_VEHICLE, type DriverVehicleInfo } from '@/lib/driverVehicle';
import type { RestaurantOrder } from '@/services/orderService';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type TrackOrderPresentationProps = {
  order: RestaurantOrder;
  delivered: boolean;
  deliveredAtLabel: string | null;
  title: string;
  subtitle: string;
  progress: number;
  etaPrimary: string;
  etaSecondary: string;
  routeCoordinates: { latitude: number; longitude: number }[];
  driverFirstName: string;
  vehicle: DriverVehicleInfo;
  hasAssignedDriver: boolean;
  messageEnabled: boolean;
  callEnabled: boolean;
  e2eCapture?: boolean;
  e2ePhase?: string;
  onClose: () => void;
  onHelp: () => void;
  onMessage: () => void;
  onCall: () => void;
  onTip: () => void;
};

export function TrackOrderPresentation({
  order,
  delivered,
  deliveredAtLabel,
  title,
  subtitle,
  progress,
  etaPrimary,
  etaSecondary,
  routeCoordinates,
  driverFirstName,
  vehicle,
  hasAssignedDriver,
  messageEnabled,
  callEnabled,
  e2eCapture,
  e2ePhase,
  onClose,
  onHelp,
  onMessage,
  onCall,
  onTip,
}: TrackOrderPresentationProps) {
  const pin =
    order.deliveryPin && !delivered && order.paymentStatus === 'paid'
      ? order.deliveryPin
      : null;

  return (
    <View style={styles.root}>
      {!delivered ? (
        <View style={styles.mapFill}>
          <CustomerTrackingMap
            order={order}
            routeCoordinates={routeCoordinates}
            e2eCapture={e2eCapture}
            e2ePhase={e2ePhase}
          />
        </View>
      ) : (
        <View style={styles.completedFill} />
      )}

      <SafeAreaView edges={['top']} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          <Pressable
            onPress={onClose}
            style={styles.circleBtn}
            accessibilityLabel="Close tracking"
          >
            <Ionicons name="close" size={22} color={UE.text} />
          </Pressable>
          <Pressable onPress={onHelp} style={styles.helpPill} accessibilityLabel="Help">
            <Text style={styles.helpTxt}>Help</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <TrackingBottomSheet preferFull={delivered}>
        <ScrollView
          style={styles.scrollFlex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          bounces
        >
          <DeliveryStatusHeader
            title={delivered ? 'Order completed' : title}
            subtitle={
              delivered
                ? deliveredAtLabel
                  ? `Delivered ${deliveredAtLabel}`
                  : 'Your order has been delivered.'
                : subtitle
            }
            progress={progress}
            delivered={delivered}
            etaPrimary={etaPrimary}
            etaSecondary={etaSecondary}
          />

          {isIWantOrder(order) ? (
            <IWantTimeline order={order} variant="light" />
          ) : (
            <CustomerMarketplaceTimeline order={order} variant="light" />
          )}

          {!delivered ? (
            <>
              <DriverVehicleInfoCard
                driverName={driverFirstName}
                driverPhotoURL={order.driver?.avatar}
                rating={order.driver?.rating ?? null}
                vehicle={hasAssignedDriver ? vehicle : { ...EMPTY_DRIVER_VEHICLE }}
                dark
              />
              <TrackingActionBar
                messageEnabled={messageEnabled}
                callEnabled={callEnabled}
                tipEnabled
                onMessage={onMessage}
                onCall={onCall}
                onTip={onTip}
              />
            </>
          ) : null}

          {pin ? (
            <View style={styles.pinBanner}>
              <View>
                <Text style={styles.pinLabel}>Delivery PIN</Text>
                <Text style={styles.pinHint}>Show this at dropoff</Text>
              </View>
              <Text style={styles.pinDigits}>{pin}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.cardHeading}>Order summary</Text>
            {order.items?.length ? (
              order.items.slice(0, 20).map((it) => (
                <View key={`${it.id}-${it.name}`} style={styles.itemRow}>
                  <Text style={styles.itemQty}>{it.qty}×</Text>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {it.name}
                  </Text>
                  <Text style={styles.itemPrice}>${(it.price * it.qty).toFixed(2)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No line items</Text>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${order.totalPrice.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeading}>Delivery details</Text>
            <Text style={styles.addrLabel}>Restaurant</Text>
            <Text style={styles.addrValue}>
              {order.restaurant?.name?.trim() || 'Restaurant'}
            </Text>
            <Text style={styles.addrSub}>{order.restaurant?.address || '—'}</Text>
            <Text style={[styles.addrLabel, { marginTop: 14 }]}>Deliver to</Text>
            <Text style={styles.addrValue}>
              {order.deliveryLocation?.address || '—'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHeading}>Support</Text>
            <Pressable onPress={onHelp} style={styles.supportRow}>
              <Ionicons name="help-circle-outline" size={20} color={UE.accent} />
              <Text style={styles.supportTxt}>Get help with this order</Text>
              <Ionicons name="chevron-forward" size={18} color={UE.textMuted} />
            </Pressable>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </TrackingBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UE.bg },
  mapFill: { ...StyleSheet.absoluteFillObject, backgroundColor: UE.surface },
  completedFill: { ...StyleSheet.absoluteFillObject, backgroundColor: UE.bg },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UE.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UE.border,
    shadowColor: UE.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  helpPill: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: UE.radiusPill,
    backgroundColor: UE.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UE.border,
  },
  helpTxt: { fontWeight: '800', color: UE.text, fontSize: 15 },
  scrollFlex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 16 },
  pinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: UE.radiusL,
    padding: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.45)',
  },
  pinLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: UE.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pinHint: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: UE.textSecondary,
  },
  pinDigits: {
    fontSize: 30,
    fontWeight: '900',
    color: UE.text,
    letterSpacing: 6,
  },
  card: {
    borderRadius: UE.radiusL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UE.border,
    padding: 16,
    marginBottom: 14,
    backgroundColor: UE.surfaceElevated,
  },
  cardHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: UE.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UE.borderLight,
    gap: 10,
  },
  itemQty: { fontWeight: '800', color: UE.textMuted, width: 36 },
  itemName: { flex: 1, fontWeight: '600', color: UE.text, fontSize: 15 },
  itemPrice: { fontWeight: '800', color: UE.text, fontSize: 15 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: UE.border,
  },
  totalLabel: { fontSize: 16, fontWeight: '800', color: UE.text },
  totalValue: { fontSize: 18, fontWeight: '900', color: UE.text },
  addrLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: UE.textMuted,
    textTransform: 'uppercase',
  },
  addrValue: { fontSize: 16, fontWeight: '800', color: UE.text, marginTop: 4 },
  addrSub: {
    fontSize: 14,
    color: UE.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  muted: { color: UE.textMuted, fontWeight: '600' },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  supportTxt: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: UE.text,
  },
});
