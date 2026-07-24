/** Types for Emo AI agent, memory, and executive reports (additive). */

export type EmoAiReportPeriod = 'daily' | 'weekly' | 'monthly';

export type EmoAiReportStatus = 'generating' | 'ready' | 'failed' | 'archived';

export type EmoAiPaymentException = {
  orderId: string;
  customerName: string;
  restaurant: string;
  meal: string;
  amount: number;
  paymentStatus: string;
  problem: string;
  resolutionStatus: string;
  refundAmount: number;
  refundStatus: string;
  paymentTransactionId: string;
  orderTimeMs: number;
  location: string;
  administratorNotes: string;
};

export type EmoAiCustomerIssueBucket = {
  label: string;
  count: number;
  trendNote: string;
};

export type EmoAiConversationTheme = {
  theme: string;
  count: number;
};

export type EmoAiHighPriorityConversation = {
  userId: string;
  userName: string;
  summary: string;
  priority: 'high' | 'critical';
  recommendedAction: string;
};

/** Optional additive conversation analytics embedded in executive reports. */
export type EmoAiUserConversationReportBlock = {
  analytics: {
    totalConversations: number;
    activeUsers: number;
    averageMessagesPerConversation: number;
    averageConversationLength: number;
    averageResponseTimeMs: number | null;
    mostActiveUsers: { userId: string; userName: string; messages: number }[];
    dailyConversationCount: number;
    weeklyConversationCount: number;
    monthlyConversationCount: number;
    highPriorityCount: number;
  };
  insights: {
    mostRequestedRestaurants: { name: string; count: number }[];
    mostRequestedMeals: { name: string; count: number }[];
    mostSearchedFood: { name: string; count: number }[];
    mostCommonComplaints: { name: string; count: number }[];
    mostRequestedFeatures: { name: string; count: number }[];
    mostCommonBugs: { name: string; count: number }[];
    mostCommonPaymentIssues: { name: string; count: number }[];
    mostCommonDeliveryIssues: { name: string; count: number }[];
    mostCommonAppQuestions: { name: string; count: number }[];
    mostCommonAiQuestions: { name: string; count: number }[];
    trendingKeywords: { name: string; count: number }[];
    frequentlyRepeatedQuestions: { name: string; count: number }[];
  };
  highPriorityConversations: {
    userId: string;
    userName: string;
    title: string;
    lastActivityMs: number;
  }[];
  conversationCountInPeriod: number;
};

export type EmoAiExecutiveReport = {
  id: string;
  period: EmoAiReportPeriod;
  title: string;
  status: EmoAiReportStatus;
  generatedAtMs: number;
  periodStartMs: number;
  periodEndMs: number;
  searchText: string;
  pdfStoragePath: string | null;
  pdfDownloadUrl: string | null;
  archived: boolean;
  executiveSummary: {
    newUsers: number;
    activeUsers: number;
    returningUsers: number;
    newOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    failedOrders: number;
    revenue: number;
    averageOrderValue: number;
    averageSplitValue: number;
    mostPopularRestaurant: string;
    mostPopularMeal: string;
    topLocations: string[];
  };
  ordersAnalytics: {
    totalOrders: number;
    completed: number;
    pending: number;
    cancelled: number;
    failed: number;
    active: number;
    avgDeliveryMinutes: number | null;
    splitCompletionRate: number;
  };
  restaurantAnalytics: {
    mostPopular: { name: string; orders: number }[];
    highestRevenue: { name: string; revenue: number }[];
    mostOrderedMeals: { name: string; count: number }[];
    avgPreparationMinutes: number | null;
    cancellationRateByRestaurant: { name: string; rate: number }[];
  };
  paymentAnalytics: {
    successful: number;
    failed: number;
    pending: number;
    refunds: number;
    revenue: number;
    averagePayment: number;
    successRate: number;
  };
  paymentExceptions: EmoAiPaymentException[];
  customerIssues: EmoAiCustomerIssueBucket[];
  conversationSummary: EmoAiConversationTheme[];
  highPriorityConversations: EmoAiHighPriorityConversation[];
  insights: string[];
  recommendations: string[];
  /** Additive: User Conversations analytics for this report period. */
  userConversations?: EmoAiUserConversationReportBlock;
};

export type EmoAiUserMemory = {
  favoriteRestaurants: string[];
  favoriteMeals: string[];
  preferredSplitSize: number | null;
  savedCoupons: string[];
  preferredFulfillment: 'delivery' | 'pickup' | null;
  notes: string[];
  lastOrderIds: string[];
  updatedAtMs: number;
  /** Long-term compact summary of prior chats (not full transcript). */
  conversationSummary?: string;
  foodAllergies?: string[];
  dietaryPreferences?: string[];
  displayName?: string | null;
  /** Whether the user already claimed the Hi emooo gift. */
  hiEmoooClaimed?: boolean;
  previousGifts?: string[];
};

export type EmoAiPlatformContextSnapshot = {
  generatedAtMs: number;
  restaurants: {
    id: string;
    name: string;
    location: string;
    isOpen: boolean;
    deliveryFee?: number | null;
    etaMinutes?: number | null;
  }[];
  meals: {
    restaurantId: string;
    restaurantName: string;
    name: string;
    price: number;
    discountLabel?: string | null;
  }[];
  promotions: { code: string; label: string }[];
  userOrders: {
    id: string;
    status: string;
    paymentStatus: string;
    deliveryStatus: string;
    restaurantName: string;
    total: number;
    splitStatus?: string;
  }[];
  memory: EmoAiUserMemory | null;
  recommendations: string[];
  orderAlerts: string[];
  agentHints: string[];
};
