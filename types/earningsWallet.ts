/**
 * Earnings Wallet System (Restaurant / Driver / Admin).
 * Ledger-style accounting — immutable transaction records.
 * Separate from customer Stripe "wallet" (saved cards) and cashback balances.
 */

export type EarningsWalletOwnerType = 'restaurant' | 'driver' | 'admin';

export type EarningsLedgerTxType =
  | 'restaurant_order_credit'
  | 'driver_delivery_credit'
  | 'admin_restaurant_commission'
  | 'admin_driver_commission'
  | 'admin_service_fee'
  | 'admin_platform_fee'
  | 'admin_promotional_bonus_paid'
  | 'admin_transfer_out'
  | 'admin_transfer_in'
  | 'restaurant_transfer_in'
  | 'driver_transfer_in'
  | 'withdrawal'
  | 'adjustment';

export type EarningsLedgerTxStatus = 'completed' | 'pending' | 'failed' | 'reversed';

/** platformSettings/earningsWalletConfig */
export type EarningsWalletConfig = {
  restaurantCommissionPercent: number;
  /** Admin cut of delivery fee (0–100). Driver receives the remainder. */
  driverCommissionPercent: number;
  deliveryBonusAmount: number;
  deliveryBonusEnabled: boolean;
  /** Flat service fee credited to admin when order has none stored. */
  serviceFeeDefault: number;
  /** Future / optional platform fee percent of food total. */
  platformFeePercent: number;
  /** Flat deductions subtracted from restaurant food earnings. */
  restaurantDeductionsFlat: number;
  updatedAt?: unknown;
  updatedBy?: string | null;
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

export type EarningsWalletDoc = {
  ownerType: EarningsWalletOwnerType;
  ownerId: string;
  /** Available / current spendable balance (ledger-derived). */
  currentBalance: number;
  pendingBalance: number;
  availableBalance: number;
  totalEarnings: number;
  lifetimeEarnings: number;
  totalWithdrawn: number;
  /** Restaurant-specific aggregates (0 for others). */
  restaurantTotalEarnings?: number;
  /** Driver-specific */
  totalDeliveries?: number;
  bonusEarnings?: number;
  deliveryEarnings?: number;
  /** Admin-specific */
  totalRevenue?: number;
  restaurantCommissions?: number;
  driverCommissions?: number;
  serviceFees?: number;
  platformFees?: number;
  promotionalBonusPaid?: number;
  totalTransfersSent?: number;
  netPlatformRevenue?: number;
  updatedAt?: unknown;
  createdAt?: unknown;
};

export type EarningsLedgerRestaurantSnapshot = {
  orderNumber: string | null;
  receiptNumber: string | null;
  customerName: string | null;
  deliveryAddress: string | null;
  paymentMethod: string | null;
  orderStatus: string | null;
  items: Array<{ name: string; quantity: number; lineTotal: number }>;
  subtotal: number;
  foodTotal: number;
  serviceFee: number;
  taxes: number;
  restaurantCommission: number;
  restaurantCommissionPercent: number;
  deductions: number;
  netRestaurantEarnings: number;
};

export type EarningsLedgerDriverSnapshot = {
  deliveryFee: number;
  driverCommissionPercent: number;
  commissionAmount: number;
  deliveryEarnings: number;
  bonus: number;
  bonusEnabled: boolean;
  netAmount: number;
};

export type EarningsLedgerAdminSnapshot = {
  source: string;
  referenceId: string | null;
  relatedOrderId: string | null;
};

export type EarningsLedgerEntry = {
  id: string;
  walletId: string;
  ownerType: EarningsWalletOwnerType;
  ownerId: string;
  type: EarningsLedgerTxType;
  status: EarningsLedgerTxStatus;
  amount: number;
  /** Signed delta applied to currentBalance (+ credit / − debit). */
  signedAmount: number;
  runningBalance: number;
  orderId: string | null;
  description: string;
  notes: string | null;
  source: string | null;
  sender: string | null;
  reason: string | null;
  referenceId: string | null;
  /** Idempotency key — never recreate. */
  idempotencyKey: string;
  restaurantSnapshot?: EarningsLedgerRestaurantSnapshot | null;
  driverSnapshot?: EarningsLedgerDriverSnapshot | null;
  adminSnapshot?: EarningsLedgerAdminSnapshot | null;
  /** Firestore server timestamp — never client Date.now() for event time. */
  createdAt: unknown;
  completedAt?: unknown;
};

export const ADMIN_EARNINGS_WALLET_ID = 'admin_platform';
export const ADMIN_EARNINGS_OWNER_ID = 'platform';

export function earningsWalletDocId(
  ownerType: EarningsWalletOwnerType,
  ownerId: string,
): string {
  if (ownerType === 'admin') return ADMIN_EARNINGS_WALLET_ID;
  return `${ownerType}_${ownerId}`;
}
