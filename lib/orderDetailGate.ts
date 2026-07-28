import { orderDetailHref } from '@/lib/orderRoutes';
import { isInHostGroup } from '@/lib/routing/routeConstants';
import { isCustomerTabsRole, normalizeRoleForRouting } from '@/lib/routing/roleTypes';
import type { ActiveWorkspace } from '@/services/activeWorkspace';
import type { UserRole } from '@/services/userService';
import type { Href } from 'expo-router';

export type OrderDetailGateInput = {
  authReady: boolean;
  loading: boolean;
  roleResolved: boolean;
  firestoreUserRole: UserRole | null;
  /** Local active workspace — when set, overrides Firestore role for shell routing. */
  activeWorkspace?: ActiveWorkspace | null;
  userUid: string | null | undefined;
  orderId: string;
  pathname: string;
  segments: string[];
};

export type OrderDetailGateDecision =
  | {
      action: 'render';
      reason: string;
      role: string;
      firestoreRole: UserRole | null;
      customerWorkspace: boolean;
      driverWorkspace: boolean;
    }
  | {
      action: 'loading';
      reason: string;
      role: string;
      firestoreRole: UserRole | null;
      customerWorkspace: boolean;
      driverWorkspace: boolean;
    }
  | {
      action: 'redirect';
      reason: string;
      href: Href;
      role: string;
      firestoreRole: UserRole | null;
      customerWorkspace: boolean;
      driverWorkspace: boolean;
    };

/** Pure gate for `/order/[id]` — customer accounts never enter driver workspace. */
export function resolveOrderDetailGate(input: OrderDetailGateInput): OrderDetailGateDecision {
  const workspace = input.activeWorkspace ?? null;
  const role = normalizeRoleForRouting(
    workspace ?? input.firestoreUserRole,
  );
  const customerWorkspace =
    workspace === 'user' ||
    (workspace == null && isCustomerTabsRole(input.firestoreUserRole));
  const driverWorkspace =
    workspace === 'driver' ||
    (workspace == null &&
      input.firestoreUserRole === 'driver' &&
      role === 'driver');
  const restaurantWorkspace =
    workspace === 'restaurant' ||
    (workspace == null &&
      input.firestoreUserRole === 'restaurant' &&
      role === 'restaurant');
  const base = {
    role,
    firestoreRole: input.firestoreUserRole,
    customerWorkspace,
    driverWorkspace,
  };

  if (customerWorkspace) {
    return { action: 'render', reason: 'customer-workspace-bypass', ...base };
  }

  if (!input.authReady || input.loading) {
    return { action: 'loading', reason: 'auth-not-settled', ...base };
  }

  if (!input.userUid?.trim() || !input.orderId) {
    return { action: 'render', reason: 'guest-or-missing-order-id', ...base };
  }

  if (!input.roleResolved) {
    return { action: 'render', reason: 'role-pending-render-children', ...base };
  }

  // All roles use root `app/order/[id].tsx` — never redirect into `(driver)/order` (duplicate URL).

  if (
    restaurantWorkspace &&
    !isInHostGroup(input.segments, input.pathname)
  ) {
    return {
      action: 'redirect',
      reason: 'restaurant-must-use-host-shell',
      href: orderDetailHref('restaurant', input.orderId),
      ...base,
    };
  }

  return { action: 'render', reason: 'default-render', ...base };
}
