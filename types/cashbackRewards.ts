export type CashbackOrderType = 'delivery' | 'pickup';

export type CashbackTransactionStatus =
  | 'pending'
  | 'available'
  | 'reserved'
  | 'redeemed'
  | 'cancelled'
  | 'expired';

export type CashbackRewardsSettings = {
  enabled: boolean;
  visibleInUserApp: boolean;
  paused: boolean;
  cashbackPercentage: number;
  maxCashbackPerOrderCad: number;
  minimumOrderValueCad: number;
  eligibleRestaurantIds: string[];
  eligibleOrderTypes: CashbackOrderType[];
  campaignBudgetCad: number;
  startAtMs: number | null;
  endAtMs: number | null;
  expirationDays: number | null;
};

export type AdminCashbackRewardsSettings = CashbackRewardsSettings & {
  totalIssuedCad: number;
  totalRedeemedCad: number;
  pendingCashbackCad: number;
  rewardsCommittedCad: number;
  activeUsers: number;
  cancelledRewards: number;
  expiredRewards: number;
};

export type CashbackTransaction = {
  id: string;
  type: 'award' | 'redemption';
  status: CashbackTransactionStatus;
  customerId: string;
  orderId: string | null;
  restaurantId: string | null;
  restaurantName: string | null;
  orderType: CashbackOrderType | null;
  amountCad: number;
  orderAmountCad: number;
  createdAtMs: number | null;
  availableAtMs: number | null;
  expiresAtMs: number | null;
  cancelledAtMs: number | null;
  expiredAtMs: number | null;
};

export type CashbackWallet = {
  settings: CashbackRewardsSettings;
  availableCad: number;
  pendingCad: number;
  reservedCad: number;
  transactions: CashbackTransaction[];
};

export type CashbackRewardsAdminDashboard = {
  settings: AdminCashbackRewardsSettings;
  analytics: {
    totalIssuedCad: number;
    totalRedeemedCad: number;
    totalPendingCad: number;
    activeUsers: number;
    redemptionRate: number;
    budgetRemainingCad: number;
  };
  topRestaurants: {
    restaurantId: string;
    restaurantName: string;
    cashbackCad: number;
    orders: number;
  }[];
  cashbackByDate: {
    date: string;
    issuedCad: number;
    pendingCad: number;
    redeemedCad: number;
  }[];
  transactions: CashbackTransaction[];
};

export type SaveCashbackRewardsSettings = CashbackRewardsSettings;

export const CASHBACK_REWARDS_DEFAULTS: CashbackRewardsSettings = {
  enabled: false,
  visibleInUserApp: true,
  paused: false,
  cashbackPercentage: 3,
  maxCashbackPerOrderCad: 100,
  minimumOrderValueCad: 0,
  eligibleRestaurantIds: [],
  eligibleOrderTypes: ['delivery', 'pickup'],
  campaignBudgetCad: 10000,
  startAtMs: null,
  endAtMs: null,
  expirationDays: null,
};
