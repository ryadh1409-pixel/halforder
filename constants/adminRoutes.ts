/** Canonical admin URLs (Expo Router — stack under tabs `app/(tabs)/admin/`). */
export const adminRoutes = {
  home: '/(tabs)/admin',
  foodTemplates: '/(tabs)/admin/food-templates',
  foodCard: (id: string) =>
    `/(tabs)/admin/food-card/${encodeURIComponent(id)}`,
  dashboard: '/(tabs)/admin/dashboard',
  analytics: '/(tabs)/admin/analytics',
  users: '/(tabs)/admin/users',
  user: (id: string) => `/(tabs)/admin/user/${encodeURIComponent(id)}`,
  orders: (params?: { filter?: string }) =>
    params?.filter
      ? `/(tabs)/admin/orders?filter=${encodeURIComponent(params.filter)}`
      : '/(tabs)/admin/orders',
  order: (id: string) => `/(tabs)/admin/order/${encodeURIComponent(id)}`,
  reports: '/(tabs)/admin/reports',
  report: (id: string) => `/(tabs)/admin/report/${encodeURIComponent(id)}`,
  complaints: '/(tabs)/admin/complaints',
  /** Broadcast push to all / targeted users (Expo push). */
  sendNotification: '/(tabs)/admin/broadcast',
  notifications: '/(tabs)/admin/notifications',
  aiInsights: '/(tabs)/admin/ai-insights',
  chatModeration: '/(tabs)/admin/chat-moderation',
  payments: '/(tabs)/admin/payments',
  payment: (id: string) =>
    `/(tabs)/admin/payments/${encodeURIComponent(id)}`,
  revenue: '/(tabs)/admin/revenue',
  payouts: '/(tabs)/admin/payouts',
  transactions: '/(tabs)/admin/transactions',
  stripeDiagnostics: '/(tabs)/admin/stripe-diagnostics',
  promotionBadges: '/(tabs)/admin/promotion-badges',
  restaurantFees: '/(tabs)/admin/restaurant-fees',
  promoCodes: '/(tabs)/admin/promo-codes',
  balances: '/(tabs)/admin/balances',
  homeBanners: '/(tabs)/admin/home-banners',
  vouchers: '/(tabs)/admin/vouchers',
  emoAiReports: '/(tabs)/admin/emo-ai-reports',
  emoAiReport: (id: string) =>
    `/(tabs)/admin/emo-ai-reports/${encodeURIComponent(id)}`,
  /** All Emo AI user conversations (admin only). */
  emoAiChat: '/(tabs)/admin/emo-ai-chat',
  /** Compose messages that appear in each user's Profile Inbox. */
  inboxMessages: '/(tabs)/admin/inbox-messages',
  /** Investor-ready Finance Dashboard (additive). */
  finance: '/(tabs)/admin/finance',
  /** Customer → Admin support conversations. */
  supportInbox: '/(tabs)/admin/support-inbox',
  supportThread: (id: string) =>
    `/(tabs)/admin/support-inbox/${encodeURIComponent(id)}`,
  onboardingManager: '/(tabs)/admin/onboarding-manager',
  pushCenter: '/(tabs)/admin/push-center',
  notificationHistory: '/(tabs)/admin/notification-history',
  restaurantManagement: '/(tabs)/admin/restaurant-management',
  driverManagement: '/(tabs)/admin/driver-management',
} as const;
