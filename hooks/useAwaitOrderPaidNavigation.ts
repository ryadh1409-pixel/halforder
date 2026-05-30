import {
  logPaymentNavigation,
  postPaymentLiveOrderHref,
  postPaymentOrderDetailsHref,
} from '@/lib/paymentNavigation';
import { db } from '@/services/firebase';
import { safeOnSnapshotDoc } from '@/utils/safeOnSnapshot';
import { useRouter } from 'expo-router';
import { doc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, Platform } from 'react-native';

const DEFAULT_TIMEOUT_MS = 45_000;

export function isOrderPaidForNavigation(
  data: Record<string, unknown> | undefined,
): boolean {
  if (!data) return false;
  const paymentStatus =
    typeof data.paymentStatus === 'string' ? data.paymentStatus.trim() : '';
  const status = typeof data.status === 'string' ? data.status.trim() : '';
  return paymentStatus === 'paid' || status === 'pending_driver' || status === 'accepted';
}

type Options = {
  orderId: string;
  /** When true, listens for webhook-paid state and navigates once. */
  enabled: boolean;
  timeoutMs?: number;
};

function schedulePostPaymentNavigation(run: () => void): void {
  if (Platform.OS === 'ios') {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(run);
    });
    return;
  }
  run();
}

/**
 * After Stripe checkout, wait for webhook to mark the order paid then go to live order UI.
 */
export function useAwaitOrderPaidNavigation({
  orderId,
  enabled,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: Options) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const [listening, setListening] = useState(false);
  const navigatedRef = useRef(false);

  const navigateToLiveOrder = useCallback(
    (id: string, source: string) => {
      if (navigatedRef.current) {
        logPaymentNavigation('navigate_skipped_duplicate', { orderId: id, source });
        return;
      }
      navigatedRef.current = true;
      const href = postPaymentLiveOrderHref(id);
      logPaymentNavigation('navigate_start', { orderId: id, source, href });
      schedulePostPaymentNavigation(() => {
        try {
          router.replace(href as never);
          logPaymentNavigation('navigate_replace_called', { orderId: id, source, href });
        } catch (error) {
          navigatedRef.current = false;
          logPaymentNavigation('navigate_replace_failed', {
            orderId: id,
            source,
            href,
            error: error instanceof Error ? error.message : String(error),
          });
          const fallback = postPaymentOrderDetailsHref(id);
          router.replace(fallback as never);
          logPaymentNavigation('navigate_fallback_order_details', { orderId: id, fallback });
        }
      });
    },
    [router],
  );

  useEffect(() => {
    const id = orderId.trim();
    if (!enabled || !id) {
      setTimedOut(false);
      setListening(false);
      return;
    }

    navigatedRef.current = false;
    setTimedOut(false);
    setListening(true);
    logPaymentNavigation('listener_start', { orderId: id });

    const unsub = safeOnSnapshotDoc(
      doc(db, 'orders', id),
      (snap) => {
        if (!snap.exists()) {
          logPaymentNavigation('snapshot_missing', { orderId: id });
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        logPaymentNavigation('snapshot_update', {
          orderId: id,
          paymentStatus: data.paymentStatus ?? null,
          status: data.status ?? null,
        });
        if (isOrderPaidForNavigation(data)) {
          navigateToLiveOrder(id, 'webhook_paid_snapshot');
        }
      },
      (error) => {
        logPaymentNavigation('snapshot_error', {
          orderId: id,
          error: error?.message ?? String(error),
        });
      },
      'payment.awaitOrderPaid',
    );

    const timer = setTimeout(() => {
      if (!navigatedRef.current) {
        setTimedOut(true);
        setListening(false);
        logPaymentNavigation('listener_timeout', { orderId: id, timeoutMs });
      }
    }, timeoutMs);

    return () => {
      clearTimeout(timer);
      unsub();
      setListening(false);
      logPaymentNavigation('listener_cleanup', { orderId: id });
    };
  }, [orderId, enabled, timeoutMs, navigateToLiveOrder]);

  return { timedOut, listening, navigateToLiveOrder };
}
