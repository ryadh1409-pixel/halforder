import { EnableLiveLocationModal } from '@/components/driver/EnableLiveLocationModal';
import { useOptionalDriverActiveOrdersFeed } from '@/contexts/DriverActiveOrdersContext';
import { isEffectivelyDelivered } from '@/lib/driverCourierSnapshotMerge';
import { subscribeDriverHubActiveOrderRemove } from '@/lib/driverHubOrdersStore';
import { MARKETPLACE_DELIVERY_STATUS } from '@/lib/orderStatus';
import { useAuthUid } from '@/hooks/useAuthUid';
import {
  ensureDriverLiveSharing,
  getDriverLiveSharingSession,
  getEnabledDriverLiveShareOrderId,
  isDriverLiveSharingActive,
  stopDriverLiveSharing,
} from '@/services/location/driverLiveSharingSession';
import {
  confirmEnableLiveLocation,
  declineEnableLiveLocation,
  registerLiveLocationPromptHost,
  type LiveLocationPromptRequest,
} from '@/services/location/promptEnableLiveLocation';
import type { ActiveDelivery } from '@/services/delivery';
import { showError, showSuccess } from '@/utils/toast';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

function isTerminalDriverOrder(order: ActiveDelivery): boolean {
  if (isEffectivelyDelivered(order)) return true;
  if (order.marketplaceCourierStatus === MARKETPLACE_DELIVERY_STATUS.CANCELLED) {
    return true;
  }
  const status = (order.status || '').toLowerCase();
  const courier = (order.firestoreDeliveryStatus || '').toLowerCase();
  return (
    status === 'cancelled' ||
    status === 'canceled' ||
    courier === 'cancelled' ||
    courier === 'canceled'
  );
}

function stillAssignedToDriver(order: ActiveDelivery, driverId: string): boolean {
  const assigned =
    (typeof order.driverId === 'string' && order.driverId.trim()) ||
    (typeof order.assignedDriverId === 'string' && order.assignedDriverId.trim()) ||
    '';
  return assigned === driverId.trim();
}

/**
 * Driver-shell host:
 * - presents Enable Live Location after Accept
 * - resumes GPS only for orders the driver explicitly enabled
 * - stops automatically on delivered / cancelled / unassigned
 */
function DriverLiveSharingHostInner() {
  const uid = useAuthUid();
  const sharedFeed = useOptionalDriverActiveOrdersFeed();
  const [prompt, setPrompt] = useState<LiveLocationPromptRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const resolveRef = useRef<((enabled: boolean) => void) | null>(null);
  const declinedRef = useRef(new Set<string>());

  useEffect(() => {
    registerLiveLocationPromptHost({
      present: (req) =>
        new Promise<boolean>((resolve) => {
          resolveRef.current = resolve;
          setPrompt(req);
        }),
    });
    return () => {
      registerLiveLocationPromptHost(null);
      if (resolveRef.current) {
        resolveRef.current(false);
        resolveRef.current = null;
      }
    };
  }, []);

  const finishPrompt = useCallback((enabled: boolean) => {
    setPrompt(null);
    setBusy(false);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(enabled);
  }, []);

  const onEnable = useCallback(() => {
    if (!prompt || busy) return;
    setBusy(true);
    void (async () => {
      declinedRef.current.delete(prompt.orderId);
      const ok = await confirmEnableLiveLocation(prompt.orderId, prompt.driverId);
      if (ok) {
        showSuccess('Live location enabled for this delivery');
      } else {
        showError('Location permission is required to share live tracking.');
      }
      finishPrompt(ok);
    })();
  }, [busy, finishPrompt, prompt]);

  const onNotNow = useCallback(() => {
    if (!prompt || busy) return;
    declinedRef.current.add(prompt.orderId);
    void declineEnableLiveLocation().finally(() => finishPrompt(false));
  }, [busy, finishPrompt, prompt]);

  // Immediate stop when hub marks the delivery complete (before Firestore prune).
  useEffect(() => {
    return subscribeDriverHubActiveOrderRemove((orderId, reason) => {
      if (!isDriverLiveSharingActive(orderId)) return;
      void stopDriverLiveSharing(
        reason === 'delivery_completed' ||
          reason === 'hub_card_deliver' ||
          reason === 'active_screen_exit'
          ? 'delivered'
          : 'cancelled',
      );
    });
  }, []);

  useEffect(() => {
    const driverId = uid.trim();
    if (!driverId) {
      void stopDriverLiveSharing('logout');
      return undefined;
    }

    // Prefer shared shell feed — never open a second active-orders listener.
    const feed = sharedFeed;
    if (!feed || feed.driverId !== driverId) {
      return undefined;
    }

    const orders = feed.orders;
    void (async () => {
      const session = getDriverLiveSharingSession();

      if (session?.running) {
        const match = orders.find((o) => o.id === session.orderId);
        if (!match || !stillAssignedToDriver(match, driverId)) {
          await stopDriverLiveSharing('unassigned');
          return;
        }
        if (isTerminalDriverOrder(match)) {
          await stopDriverLiveSharing(
            isEffectivelyDelivered(match) ? 'delivered' : 'cancelled',
          );
        }
        return;
      }

      const enabledId = await getEnabledDriverLiveShareOrderId();
      if (!enabledId || declinedRef.current.has(enabledId)) return;
      const primary = orders.find(
        (o) =>
          o.id === enabledId &&
          stillAssignedToDriver(o, driverId) &&
          !isTerminalDriverOrder(o),
      );
      if (primary) {
        await ensureDriverLiveSharing(primary.id, driverId);
      } else {
        await stopDriverLiveSharing('unassigned');
      }
    })();

    return undefined;
  }, [uid, sharedFeed?.driverId, sharedFeed?.orders]);

  return (
    <EnableLiveLocationModal
      visible={prompt != null}
      busy={busy}
      onEnable={onEnable}
      onNotNow={onNotNow}
    />
  );
}

export const DriverLiveSharingHost = memo(DriverLiveSharingHostInner);
