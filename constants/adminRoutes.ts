/** Canonical admin URLs (Expo Router — stack under tabs `app/(tabs)/admin/`). */
export const adminRoutes = {
  home: '/(tabs)/admin',
  foodTemplates: '/(tabs)/admin/food-templates',
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
  aiInsights: '/(tabs)/admin/ai-insights',
} as const;
