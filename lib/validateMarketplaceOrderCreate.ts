import type { UserRole } from '@/services/userService';

export type MarketplaceOrderRulePayload = {
  userId: string;
  customerId?: string | null;
  restaurantId: string;
  venueId: string;
  status: string;
  paymentStatus: string;
  deliveryType: string;
  hasCreatedAt: boolean;
};

export type MarketplaceOrderRuleContext = {
  authUid: string | null;
  userRole: UserRole | string | null;
  restricted: boolean;
  banned: boolean;
  userProfileExists: boolean;
};

export type RuleCheckResult = {
  id: string;
  pass: boolean;
  detail?: string;
};

/** Mirrors `isValidMarketplaceOrderCreate()` in firestore.rules (dev diagnostics). */
export function evaluateMarketplaceOrderCreateRules(
  payload: MarketplaceOrderRulePayload,
  ctx: MarketplaceOrderRuleContext,
): RuleCheckResult[] {
  const role = ctx.userRole ?? '';
  const checks: RuleCheckResult[] = [];

  const ownerMatch =
    Boolean(ctx.authUid) &&
    typeof payload.userId === 'string' &&
    payload.userId === ctx.authUid;
  checks.push({
    id: 'ordersCreateOwnerMatchesAuth',
    pass: ownerMatch,
    detail: `auth=${ctx.authUid} payload.userId=${payload.userId}`,
  });

  const roleAllowsCheckout =
    role !== 'driver' &&
    (role === 'user' ||
      role === 'customer' ||
      role === '' ||
      role === 'restaurant' ||
      role === 'host' ||
      role === 'admin');
  checks.push({
    id: 'requestUserRoleAllowsMarketplaceCheckout',
    pass: roleAllowsCheckout,
    detail: `role="${role}" profileExists=${ctx.userProfileExists}`,
  });

  checks.push({
    id: 'notRestricted',
    pass: !ctx.restricted && !ctx.banned,
    detail: `restricted=${ctx.restricted} banned=${ctx.banned}`,
  });

  checks.push({
    id: 'restaurantId',
    pass:
      typeof payload.restaurantId === 'string' && payload.restaurantId.length > 0,
  });
  checks.push({
    id: 'venueId',
    pass: typeof payload.venueId === 'string' && payload.venueId.length > 0,
  });
  checks.push({
    id: 'status',
    pass: payload.status === 'awaiting_payment',
    detail: payload.status,
  });
  checks.push({
    id: 'paymentStatus',
    pass: payload.paymentStatus === 'unpaid',
    detail: payload.paymentStatus,
  });
  checks.push({
    id: 'deliveryType',
    pass: payload.deliveryType === 'delivery' || payload.deliveryType === 'pickup',
    detail: payload.deliveryType,
  });
  checks.push({
    id: 'customerId',
    pass:
      payload.customerId == null ||
      payload.customerId === '' ||
      payload.customerId === ctx.authUid,
    detail: String(payload.customerId ?? '(none)'),
  });
  checks.push({
    id: 'createdAtPresent',
    pass: payload.hasCreatedAt,
    detail: 'serverTimestamp() sent — rules require createdAt == request.time',
  });

  return checks;
}

export function logMarketplaceOrderRuleChecks(
  checks: RuleCheckResult[],
): boolean {
  const allPass = checks.every((c) => c.pass);
  if (__DEV__) {
    console.warn('[createOrder][rules-debug] marketplace create validation', {
      allPass,
      failed: checks.filter((c) => !c.pass).map((c) => ({ id: c.id, detail: c.detail })),
      passed: checks.filter((c) => c.pass).map((c) => c.id),
    });
  }
  return allPass;
}
