export type DriverReferralRewardType =
  | 'delivery_fee_percentage'
  | 'fixed_amount';

export type DriverReferralRewardStatus =
  | 'pending'
  | 'approved'
  | 'paid'
  | 'cancelled';

export type DriverReferralCampaignSettings = {
  enabled: boolean;
  visibleInDriverApp: boolean;
  paused: boolean;
  rewardType: DriverReferralRewardType;
  rewardPercentage: number;
  fixedRewardCad: number;
  campaignBudgetCad: number;
  startAtMs: number | null;
  endAtMs: number | null;
  maxReferralsPerDriver: number;
  minimumOrderValueCad: number;
  requireCompletedPayment: boolean;
  requireCompletedDelivery: boolean;
  totalReferrals: number;
  acquiredCustomers: number;
  rewardsPaidCad: number;
  rewardsCommittedCad: number;
  approvedRewards: number;
  paidRewards: number;
  cancelledRewards: number;
};

export type DriverReferralHistoryRow = {
  id: string;
  customerName: string;
  customerId: string;
  driverId: string;
  orderId: string | null;
  orderDateMs: number | null;
  rewardAmountCad: number;
  status: DriverReferralRewardStatus;
};

export type DriverReferralDashboard = {
  code: string;
  inviteLink: string;
  campaign: Pick<
    DriverReferralCampaignSettings,
    | 'enabled'
    | 'visibleInDriverApp'
    | 'paused'
    | 'rewardType'
    | 'rewardPercentage'
    | 'fixedRewardCad'
    | 'startAtMs'
    | 'endAtMs'
  >;
  stats: {
    successfulReferrals: number;
    pendingRewards: number;
    totalReferralRewardsCad: number;
  };
  history: DriverReferralHistoryRow[];
};

export type DriverReferralAdminDashboard = {
  settings: DriverReferralCampaignSettings;
  analytics: {
    totalReferrals: number;
    newCustomersAcquired: number;
    conversionRate: number;
    rewardsPaidCad: number;
    pendingRewards: number;
    budgetRemainingCad: number;
  };
  topDrivers: {
    driverId: string;
    driverName: string;
    totalReferrals: number;
    successfulReferrals: number;
    rewardsCad: number;
  }[];
  rewards: DriverReferralHistoryRow[];
};

export const DRIVER_REFERRAL_CAMPAIGN_DEFAULTS: DriverReferralCampaignSettings = {
  enabled: false,
  visibleInDriverApp: false,
  paused: false,
  rewardType: 'delivery_fee_percentage',
  rewardPercentage: 100,
  fixedRewardCad: 5,
  campaignBudgetCad: 1000,
  startAtMs: null,
  endAtMs: null,
  maxReferralsPerDriver: 100,
  minimumOrderValueCad: 0,
  requireCompletedPayment: true,
  requireCompletedDelivery: true,
  totalReferrals: 0,
  acquiredCustomers: 0,
  rewardsPaidCad: 0,
  rewardsCommittedCad: 0,
  approvedRewards: 0,
  paidRewards: 0,
  cancelledRewards: 0,
};
