export type AdminStripePayoutRow = {
  id: string;
  createdMs: number | null;
  arrivalMs: number | null;
  amount: number;
  currency: string;
  status: string;
  statusLabel: string;
  bankAccount: string;
};

export type AdminStripePayoutsPayload = {
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  lifetimeRevenue: number;
  nextPayoutDateMs: number | null;
  nextPayoutAmount: number | null;
  nextPayoutCurrency: string | null;
  recentPayouts: AdminStripePayoutRow[];
  fetchedAtMs: number;
};
