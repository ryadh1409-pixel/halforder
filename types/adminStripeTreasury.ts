export type StripeTreasurySummaryPayload = {
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  lifetimeRevenue: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
  refundedPayments: number;
  fetchedAtMs: number;
};

export type StripeAccountDiagnosticsPayload = {
  stripeAccountConnected: boolean;
  liveMode: boolean;
  bankAccountConnected: boolean;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  accountId: string | null;
  defaultCurrency: string | null;
  country: string | null;
  warnings: string[];
  fetchedAtMs: number;
};
