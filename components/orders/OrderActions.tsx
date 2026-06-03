import type { MerchantOrderStatus } from '@/components/orders/statusFlow';
import type { RestaurantKitchenAction } from '@/lib/restaurantKitchenActions';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import StatusActionButton from '@/components/orders/StatusActionButton';

type Props = {
  status: MerchantOrderStatus;
  loading?: boolean;
  pendingAction?: RestaurantKitchenAction | null;
  onAccept: () => void;
  onStartPreparing: () => void;
  onReject: () => void;
  onMarkReady: () => void;
};

export default function OrderActions({
  status,
  loading,
  pendingAction = null,
  onAccept,
  onStartPreparing,
  onReject,
  onMarkReady,
}: Props) {
  if (status === 'pending') {
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <StatusActionButton
            label={
              loading && pendingAction === 'accept' ? 'Accepting…' : 'Accept Order'
            }
            onPress={onAccept}
            loading={loading && pendingAction === 'accept'}
          />
        </View>
        <View style={{ width: 110 }}>
          <StatusActionButton
            label="Reject"
            onPress={onReject}
            loading={loading && pendingAction === 'accept'}
            tone="danger"
          />
        </View>
      </View>
    );
  }
  if (status === 'accepted') {
    return (
      <StatusActionButton
        label={
          loading && pendingAction === 'preparing'
            ? 'Start Preparing…'
            : 'Start Preparing'
        }
        onPress={onStartPreparing}
        loading={loading && pendingAction === 'preparing'}
      />
    );
  }
  if (status === 'preparing') {
    return (
      <StatusActionButton
        label={loading && pendingAction === 'ready' ? 'Marking Ready…' : 'Mark Ready'}
        onPress={onMarkReady}
        loading={loading && pendingAction === 'ready'}
      />
    );
  }
  if (status === 'ready') {
    return <StatusActionButton label="Waiting for Driver" tone="secondary" disabled />;
  }
  if (status === 'picked_up') {
    return <StatusActionButton label="Out for Delivery" tone="secondary" disabled />;
  }
  if (status === 'delivered') {
    return <StatusActionButton label="Completed" tone="secondary" disabled />;
  }
  return null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  waiting: { color: '#334155', fontWeight: '700', marginTop: 12 },
});
