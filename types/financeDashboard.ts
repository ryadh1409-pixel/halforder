/** Types for the Admin Finance Dashboard (additive module). */

export type FinanceDateFilter =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'last_month'
  | 'custom'
  | 'all';

export type FinanceKpis = {
  gmv: number;
  platformRevenue: number;
  netRevenue: number;
  totalOrders: number;
  completedOrders: number;
  activeOrders: number;
  cancelledOrders: number;
  failedOrders: number;
  totalRefundsAmount: number;
  pendingRefundsCount: number;
  successfulPayments: number;
  failedPayments: number;
  averageOrderValue: number;
  averageSplitValue: number;
};

export type FinanceRevenuePoint = {
  label: string;
  revenue: number;
  count: number;
};

export type FinanceRevenueAnalytics = {
  daily: FinanceRevenuePoint[];
  weekly: FinanceRevenuePoint[];
  monthly: FinanceRevenuePoint[];
  yearly: FinanceRevenuePoint[];
  growthPct: number;
  trendLabel: string;
};

export type FinanceOrderRow = {
  id: string;
  customer: string;
  restaurant: string;
  meal: string;
  totalAmount: number;
  splitAmount: number;
  platformFee: number;
  deliveryFee: number;
  netRevenue: number;
  status: string;
  paymentStatus: string;
  dateMs: number | null;
};

export type FinancePaymentAnalytics = {
  successful: number;
  failed: number;
  pending: number;
  refunded: number;
  stripeFees: number;
  netReceived: number;
  averagePayment: number;
  successRate: number;
};

export type FinanceRefundAnalytics = {
  totalRefundAmount: number;
  pendingCount: number;
  completedCount: number;
  refundRate: number;
  reasons: { reason: string; count: number }[];
  timeline: FinanceRevenuePoint[];
  history: {
    id: string;
    amount: number;
    status: string;
    customer: string;
    dateMs: number | null;
    reason: string;
  }[];
};

export type FinanceExceptionRow = {
  orderId: string;
  customer: string;
  restaurant: string;
  meal: string;
  amount: number;
  paymentStatus: string;
  refundStatus: string;
  issue: string;
  resolution: string;
  transactionId: string;
  timestampMs: number | null;
  adminNotes: string;
};

export type FinanceRestaurantRow = {
  restaurantId: string;
  name: string;
  revenue: number;
  orders: number;
  aov: number;
  avgSplit: number;
  refundRate: number;
  cancellationRate: number;
  topMeals: string[];
};

export type FinanceCustomerRow = {
  customerId: string;
  name: string;
  lifetimeSpend: number;
  totalOrders: number;
  aov: number;
  avgSplit: number;
  refundCount: number;
};

export type FinanceExpenseCategory =
  | 'google_maps'
  | 'firebase'
  | 'openai'
  | 'stripe_fees'
  | 'hosting'
  | 'marketing'
  | 'operations'
  | 'manual'
  | 'other';

export type FinanceExpense = {
  id: string;
  category: FinanceExpenseCategory;
  label: string;
  amount: number;
  notes: string;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  createdBy: string | null;
};

export type FinanceProfitLoss = {
  grossRevenue: number;
  platformRevenue: number;
  operatingExpenses: number;
  refunds: number;
  netRevenue: number;
  netProfit: number;
  profitMargin: number;
};

export type FinanceCashFlow = {
  moneyIn: number;
  moneyOut: number;
  currentBalance: number;
  pendingBalance: number;
  expectedIncoming: number;
  expectedOutgoing: number;
};

export type FinanceBalanceSheet = {
  assets: number;
  cash: number;
  accountsReceivable: number;
  liabilities: number;
  accountsPayable: number;
  equity: number;
  netAssets: number;
};

export type FinanceTaxSummary = {
  collectedTaxes: number;
  estimatedTaxes: number;
  taxableRevenue: number;
};

export type FinanceInsight = {
  id: string;
  text: string;
};

export type FinanceRecommendation = {
  id: string;
  text: string;
};

export type FinanceStoredReport = {
  id: string;
  title: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  body: string;
  createdAtMs: number | null;
  archived: boolean;
};
