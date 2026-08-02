/**
 * Pure earnings-wallet math for Cloud Functions (mirrors lib/earningsWalletMath.ts).
 * Kept in-tree so `main/` does not depend on the Expo app path aliases.
 */

export type EarningsWalletConfig = {
  restaurantCommissionPercent: number;
  driverCommissionPercent: number;
  deliveryBonusAmount: number;
  deliveryBonusEnabled: boolean;
  serviceFeeDefault: number;
  platformFeePercent: number;
  restaurantDeductionsFlat: number;
};

export const DEFAULT_EARNINGS_WALLET_CONFIG: EarningsWalletConfig = {
  restaurantCommissionPercent: 15,
  driverCommissionPercent: 20,
  deliveryBonusAmount: 6,
  deliveryBonusEnabled: true,
  serviceFeeDefault: 0,
  platformFeePercent: 0,
  restaurantDeductionsFlat: 0,
};

export type OrderEarningsInputs = {
  items?: Array<{ name?: unknown; quantity?: unknown; price?: unknown; total?: unknown }>;
  subtotal?: unknown;
  totalPrice?: unknown;
  deliveryFee?: unknown;
  fees?: unknown;
  tax?: unknown;
  taxes?: unknown;
  serviceFee?: unknown;
  tip?: unknown;
};

function money(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function asNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const p = Number.parseFloat(v.trim());
    if (Number.isFinite(p)) return p;
  }
  return fallback;
}

export function clampPercent(raw: unknown, fallback: number): number {
  const n = asNum(raw, fallback);
  return Math.max(0, Math.min(100, money(n)));
}

export function normalizeEarningsWalletConfig(
  raw: Partial<EarningsWalletConfig> | null | undefined,
): EarningsWalletConfig {
  const d = DEFAULT_EARNINGS_WALLET_CONFIG;
  return {
    restaurantCommissionPercent: clampPercent(
      raw?.restaurantCommissionPercent,
      d.restaurantCommissionPercent,
    ),
    driverCommissionPercent: clampPercent(
      raw?.driverCommissionPercent,
      d.driverCommissionPercent,
    ),
    deliveryBonusAmount: Math.max(0, money(asNum(raw?.deliveryBonusAmount, d.deliveryBonusAmount))),
    deliveryBonusEnabled: raw?.deliveryBonusEnabled !== false,
    serviceFeeDefault: Math.max(0, money(asNum(raw?.serviceFeeDefault, d.serviceFeeDefault))),
    platformFeePercent: clampPercent(raw?.platformFeePercent, d.platformFeePercent),
    restaurantDeductionsFlat: Math.max(
      0,
      money(asNum(raw?.restaurantDeductionsFlat, d.restaurantDeductionsFlat)),
    ),
  };
}

export function resolveDeliveryFeeFromOrder(order: OrderEarningsInputs): number {
  const fee = asNum(order.deliveryFee, NaN);
  if (Number.isFinite(fee) && fee >= 0) return money(fee);
  const fees = asNum(order.fees, NaN);
  if (Number.isFinite(fees) && fees >= 0) return money(fees);
  return 0;
}

export function resolveTaxFromOrder(order: OrderEarningsInputs): number {
  const t = asNum(order.tax, NaN);
  if (Number.isFinite(t) && t >= 0) return money(t);
  const taxes = asNum(order.taxes, NaN);
  if (Number.isFinite(taxes) && taxes >= 0) return money(taxes);
  return 0;
}

export function resolveServiceFeeFromOrder(
  order: OrderEarningsInputs,
  config: EarningsWalletConfig,
): number {
  const s = asNum(order.serviceFee, NaN);
  if (Number.isFinite(s) && s >= 0) return money(s);
  return money(config.serviceFeeDefault);
}

export function resolveFoodTotalFromOrder(order: OrderEarningsInputs): number {
  const sub = asNum(order.subtotal, NaN);
  if (Number.isFinite(sub) && sub > 0) return money(sub);

  if (Array.isArray(order.items) && order.items.length > 0) {
    let sum = 0;
    let any = false;
    for (const it of order.items) {
      const line = asNum(it.total, NaN);
      if (Number.isFinite(line)) {
        sum += line;
        any = true;
        continue;
      }
      const qty = Math.max(1, asNum(it.quantity, 1));
      const price = asNum(it.price, NaN);
      if (Number.isFinite(price)) {
        sum += price * qty;
        any = true;
      }
    }
    if (any) return money(sum);
  }

  const total = asNum(order.totalPrice, NaN);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const delivery = resolveDeliveryFeeFromOrder(order);
  const tax = resolveTaxFromOrder(order);
  const tip = asNum(order.tip, 0);
  return money(Math.max(0, total - delivery - tax - tip));
}

export type RestaurantEarningsBreakdown = {
  foodTotal: number;
  restaurantCommissionPercent: number;
  restaurantCommission: number;
  deductions: number;
  netRestaurantEarnings: number;
};

export function calculateRestaurantEarnings(
  order: OrderEarningsInputs,
  config: EarningsWalletConfig,
): RestaurantEarningsBreakdown {
  const foodTotal = resolveFoodTotalFromOrder(order);
  const restaurantCommissionPercent = config.restaurantCommissionPercent;
  const restaurantCommission = money((foodTotal * restaurantCommissionPercent) / 100);
  const deductions = money(config.restaurantDeductionsFlat);
  const netRestaurantEarnings = money(
    Math.max(0, foodTotal - restaurantCommission - deductions),
  );
  return {
    foodTotal,
    restaurantCommissionPercent,
    restaurantCommission,
    deductions,
    netRestaurantEarnings,
  };
}

export type DriverEarningsBreakdown = {
  deliveryFee: number;
  driverCommissionPercent: number;
  commissionAmount: number;
  deliveryEarnings: number;
  bonus: number;
  bonusEnabled: boolean;
  netAmount: number;
};

export function calculateDriverWalletEarnings(
  order: OrderEarningsInputs,
  config: EarningsWalletConfig,
): DriverEarningsBreakdown {
  const deliveryFee = resolveDeliveryFeeFromOrder(order);
  const driverCommissionPercent = config.driverCommissionPercent;
  const commissionAmount = money((deliveryFee * driverCommissionPercent) / 100);
  const deliveryEarnings = money(Math.max(0, deliveryFee - commissionAmount));
  const bonusEnabled = config.deliveryBonusEnabled === true;
  const bonus = bonusEnabled ? money(config.deliveryBonusAmount) : 0;
  const netAmount = money(deliveryEarnings + bonus);
  return {
    deliveryFee,
    driverCommissionPercent,
    commissionAmount,
    deliveryEarnings,
    bonus,
    bonusEnabled,
    netAmount,
  };
}

export type AdminOrderRevenueBreakdown = {
  restaurantCommission: number;
  driverCommission: number;
  serviceFee: number;
  platformFee: number;
  promotionalBonusPaid: number;
  totalAdminCredit: number;
  netPlatformRevenueDelta: number;
};

export function calculateAdminOrderRevenue(
  restaurant: RestaurantEarningsBreakdown,
  driver: DriverEarningsBreakdown,
  order: OrderEarningsInputs,
  config: EarningsWalletConfig,
): AdminOrderRevenueBreakdown {
  const serviceFee = resolveServiceFeeFromOrder(order, config);
  const platformFee = money((restaurant.foodTotal * config.platformFeePercent) / 100);
  const restaurantCommission = restaurant.restaurantCommission;
  const driverCommission = driver.commissionAmount;
  const promotionalBonusPaid = driver.bonus;
  const totalAdminCredit = money(
    restaurantCommission + driverCommission + serviceFee + platformFee,
  );
  const netPlatformRevenueDelta = money(totalAdminCredit - promotionalBonusPaid);
  return {
    restaurantCommission,
    driverCommission,
    serviceFee,
    platformFee,
    promotionalBonusPaid,
    totalAdminCredit,
    netPlatformRevenueDelta,
  };
}

export function mapOrderItemsForSnapshot(
  items: OrderEarningsInputs["items"],
): Array<{ name: string; quantity: number; lineTotal: number }> {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const qty = Math.max(1, Math.round(asNum(it.quantity, 1)));
    const line = asNum(it.total, NaN);
    const price = asNum(it.price, 0);
    const lineTotal = Number.isFinite(line) ? money(line) : money(price * qty);
    const name =
      typeof it.name === "string" && it.name.trim() ? it.name.trim() : "Item";
    return { name, quantity: qty, lineTotal };
  });
}
