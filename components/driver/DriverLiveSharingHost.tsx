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
 * - stops automatically on delivered / cancelled / confirmed unassigned
 *
 * CRITICAL: Never treat "order not yet in the active feed" as unassigned.
 * After accept, the feed can lag behind live sharing start — stopping then
 * cleared AsyncStorage + deleted orders.driverLocation and left customers
 * stuck on "Waiting for driver location…".
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

  // Stop GPS only on definitive delivery completion — never on feed prune / false
  // terminal signals. firestore_terminal / listener_prune previously mapped to
  // stop('cancelled') which deleted orders.driverLocation while the courier was
  // still mid-delivery (picked_up), leaving customers stuck on Waiting…
  useEffect(() => {
    return subscribeDriverHubActiveOrderRemove((orderId, reason) => {
      if (!isDriverLiveSharingActive(orderId)) return;
      if (
        reason === 'delivery_completed' ||
        reason === 'hub_card_deliver' ||
        reason === 'active_screen_exit'
      ) {
        console.log('[DRIVER LIVE SHARE] stop_on_hub_complete', {
          orderId,
          reason,
          timestamp: Date.now(),
        });
        void stopDriverLiveSharing('delivered');
        return;
      }
      console.log('[DRIVER LIVE SHARE] ignore_hub_remove', {
        orderId,
        reason,
        timestamp: Date.now(),
        note: 'keep_publishing_until_definitive_complete',
      });
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
        if (!match) {
          // Feed lag after accept — keep publishing. Do NOT stop or clear GPS.
          console.log('[DRIVER LIVE SHARE] keep_running_feed_lag', {
            orderId: session.orderId,
            feedCount: orders.length,
            timestamp: Date.now(),
          });
          return;
        }
        if (!stillAssignedToDriver(match, driverId)) {
          // Confirm against Firestore before wiping GPS — feed flickers can
          // briefly omit assignment fields without the order being unassigned.
          try {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('@/services/firebase');
            const snap = await getDoc(doc(db, 'orders', session.orderId));
            if (snap.exists()) {
              const data = snap.data() as Record<string, unknown>;
              const assigned =
                (typeof data.driverId === 'string' && data.driverId.trim()) ||
                (typeof data.assignedDriverId === 'string' &&
                  data.assignedDriverId.trim()) ||
                '';
              if (assigned === driverId) {
                console.log('[DRIVER LIVE SHARE] keep_running_assignment_flicker', {
                  orderId: session.orderId,
                  timestamp: Date.now(),
                });
                return;
              }
            }
          } catch {
            /* fall through to stop */
          }
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
        return;
      }

      const enabledInFeed = orders.find((o) => o.id === enabledId);
      if (!enabledInFeed) {
        // Enabled order not in feed yet (post-accept race) — wait, do not clear.
        console.log('[DRIVER LIVE SHARE] wait_for_feed', {
          enabledId,
          feedCount: orders.length,
          timestamp: Date.now(),
        });
        return;
      }

      // Order is in the feed but no longer assigned / already terminal.
      if (!stillAssignedToDriver(enabledInFeed, driverId) || isTerminalDriverOrder(enabledInFeed)) {
        await stopDriverLiveSharing(
          isTerminalDriverOrder(enabledInFeed) ? 'cancelled' : 'unassigned',
        );
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
