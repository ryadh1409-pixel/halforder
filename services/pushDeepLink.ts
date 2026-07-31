/**
 * Handle tap → deep link for admin / system / restaurant push payloads.
 */
import { isExpoGo } from '@/constants/runtimeEnvironment';
import { RESTAURANT_NEW_ORDER_PUSH_TYPE } from '@/constants/pushTypes';
import { adminRoutes } from '@/constants/adminRoutes';
import { HOST_ROUTES } from '@/lib/navigationPaths';
import { setRestaurantOrderFocusFromPush } from '@/lib/restaurantOrderFocus';
import { increment, doc, updateDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { db } from './firebase';
import {
  logNotificationOpened,
  logNotificationReceived,
} from './notificationTracking';

type NavigateFn = (href: string) => void;

let wired = false;
let coldStartHandled = false;

function resolveDeepLink(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const candidates = [data.deepLink, data.url, data.path, data.href];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function resolvePushNavigation(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const type = typeof data.type === 'string' ? data.type.trim() : '';
  const orderId = typeof data.orderId === 'string' ? data.orderId.trim() : '';

  if (type === RESTAURANT_NEW_ORDER_PUSH_TYPE && orderId) {
    setRestaurantOrderFocusFromPush(orderId);
  } else if (orderId && resolveDeepLink(data)?.includes('focusOrderId=')) {
    // Restaurant focus via deep link query
    if (resolveDeepLink(data)?.includes('/(host)/')) {
      setRestaurantOrderFocusFromPush(orderId);
    }
  }

  const link = resolveDeepLink(data);
  if (link) {
    // Admin paid-order: land on dashboard then open the order detail.
    if (
      type === 'admin_new_order_created' &&
      orderId &&
      link.includes('/(tabs)/admin/dashboard')
    ) {
      return adminRoutes.order(orderId);
    }
    return link;
  }

  if (type === RESTAURANT_NEW_ORDER_PUSH_TYPE && orderId) {
    return `${HOST_ROUTES.orders}?focusOrderId=${encodeURIComponent(orderId)}`;
  }

  if (type === 'admin_new_order_created' && orderId) {
    return adminRoutes.order(orderId);
  }

  return null;
}

async function bumpCampaignOpened(campaignId: unknown): Promise<void> {
  if (typeof campaignId !== 'string' || !campaignId.trim()) return;
  try {
    await updateDoc(doc(db, 'pushCampaigns', campaignId.trim()), {
      openedCount: increment(1),
    });
  } catch {
    /* best-effort analytics */
  }
}

/**
 * Wire once: foreground receive logging + tap → navigate + opened tracking.
 */
export function wirePushNotificationDeepLinks(navigate: NavigateFn): () => void {
  if (Platform.OS === 'web' || isExpoGo) {
    return () => undefined;
  }
  if (wired) {
    return () => undefined;
  }
  wired = true;

  const receivedSub = Notifications.addNotificationReceivedListener((n) => {
    const id = n.request.identifier;
    void logNotificationReceived(id);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const content = response.notification.request.content;
      const data = (content.data ?? {}) as Record<string, unknown>;
      void logNotificationOpened(response.notification.request.identifier);
      void bumpCampaignOpened(data.campaignId);

      const link = resolvePushNavigation(data);
      if (link) {
        try {
          navigate(link);
        } catch (e) {
          console.warn('[push] deep link navigate failed', link, e);
        }
      }
    },
  );

  if (!coldStartHandled) {
    coldStartHandled = true;
    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (!last) return;
      const data = (last.notification.request.content.data ?? {}) as Record<
        string,
        unknown
      >;
      const link = resolvePushNavigation(data);
      if (link) {
        try {
          navigate(link);
        } catch {
          /* ignore cold-start race */
        }
      }
    });
  }

  return () => {
    wired = false;
    receivedSub.remove();
    responseSub.remove();
  };
}
