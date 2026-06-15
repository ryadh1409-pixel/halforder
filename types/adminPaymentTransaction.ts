export type PaymentTransactionStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'disputed';

export type AdminPaymentTransaction = {
  id: string;
  createdAtMs: number | null;
  paidAtMs: number | null;
  stripePaymentIntentId: string;
  stripeChargeId: string | null;
  amount: number;
  currency: string;
  platformFee: number;
  deliveryFee: number;
  foodAmount: number;
  stripeFee: number;
  netRevenue: number;
  customerId: string;
  customerName: string | null;
  partnerId: string | null;
  partnerName: string | null;
  adminFoodShareId: string | null;
  adminFoodShareName: string | null;
  adminFoodShareImage: string | null;
  matchId: string | null;
  orderId: string | null;
  restaurantId: string | null;
  restaurantName: string | null;
  driverId: string | null;
  driverName: string | null;
  status: PaymentTransactionStatus;
  paymentMethodBrand: string | null;
  paymentMethodLast4: string | null;
  paymentMethodLabel: string | null;
  receiptUrl: string | null;
  source: 'food_share' | 'marketplace';
};

export type AdminPaymentSummary = {
  grossRevenue: number;
  revenueToday: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
  pendingCount: number;
  successfulCount: number;
  refundedCount: number;
  disputedCount: number;
  failedCount: number;
  foodShareRevenue: number;
  deliveryRevenue: number;
  platformFees: number;
};

export type AdminPaymentDateFilter = 'today' | '7d' | '30d' | 'all';

export type AdminRevenueBucket = {
  label: string;
  revenue: number;
  count: number;
};

export type AdminTopFoodCard = {
  adminFoodShareId: string;
  name: string;
  image: string | null;
  revenue: number;
  count: number;
};

export type AdminTopRestaurant = {
  restaurantId: string;
  name: string;
  revenue: number;
  count: number;
};
