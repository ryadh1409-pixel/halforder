import type {
  EmoAiConversationTheme,
  EmoAiCustomerIssueBucket,
  EmoAiHighPriorityConversation,
  EmoAiPaymentException,
  EmoAiReportPeriod,
} from '@/types/emoAiAgent';

/** Heuristic insights + recommendations for executive reports. */
export function buildEmoAiInsightsAndRecommendations(args: {
  period: EmoAiReportPeriod;
  newOrders: number;
  completed: number;
  cancelled: number;
  revenue: number;
  mostPopularMeal: string;
  mostPopularRestaurant: string;
  paymentExceptions: EmoAiPaymentException[];
  customerIssues: EmoAiCustomerIssueBucket[];
  restaurantCancellations: { name: string; rate: number }[];
  conversationSummary: EmoAiConversationTheme[];
}): {
  insights: string[];
  recommendations: string[];
  highPriorityConversations: EmoAiHighPriorityConversation[];
} {
  const insights: string[] = [];
  const recommendations: string[] = [];

  if (args.mostPopularMeal && args.mostPopularMeal !== 'n/a') {
    insights.push(
      `${args.mostPopularMeal} is the most ordered meal this ${args.period} period.`,
    );
  }
  if (args.mostPopularRestaurant && args.mostPopularRestaurant !== 'n/a') {
    insights.push(
      `${args.mostPopularRestaurant} leads restaurant order volume this period.`,
    );
  }
  const cancelRate = args.newOrders
    ? args.cancelled / args.newOrders
    : 0;
  if (cancelRate >= 0.12) {
    insights.push(
      `Cancellation rate is elevated at ${(cancelRate * 100).toFixed(1)}% of new orders.`,
    );
    recommendations.push(
      'Investigate restaurants and drivers with the highest cancellation rates.',
    );
  }
  if (args.paymentExceptions.length > 0) {
    insights.push(
      `${args.paymentExceptions.length} paid-order exception(s) require finance/ops review.`,
    );
    recommendations.push(
      'Prioritize Payment Exception Report items — paid customers without successful fulfillment.',
    );
  }
  const hotIssue = args.customerIssues[0];
  if (hotIssue) {
    insights.push(
      `Top customer issue theme: ${hotIssue.label} (${hotIssue.count} occurrences).`,
    );
  }
  const riskyRest = args.restaurantCancellations.find((r) => r.rate >= 0.2);
  if (riskyRest) {
    insights.push(
      `${riskyRest.name} has an unusually high cancellation rate (${(riskyRest.rate * 100).toFixed(0)}%).`,
    );
    recommendations.push(`Review operations for ${riskyRest.name}.`);
  }
  const pizzaTheme = args.conversationSummary.find((t) =>
    /pizza/i.test(t.theme),
  );
  if (pizzaTheme) {
    insights.push(
      `Pizza demand signals from conversations: ${pizzaTheme.count} related asks.`,
    );
    recommendations.push('Increase pizza promotions during peak lunch hours.');
  }
  if (args.revenue > 0) {
    insights.push(
      `Gross completed-order revenue this period: $${args.revenue.toFixed(2)}.`,
    );
  }
  if (!recommendations.length) {
    recommendations.push('Promote highest-rated restaurants in Home banners.');
    recommendations.push('Monitor refund growth week over week.');
    recommendations.push('Keep delivery coverage strong in top locations.');
  }

  const highPriorityConversations: EmoAiHighPriorityConversation[] =
    args.paymentExceptions.slice(0, 8).map((e) => ({
      userId: e.customerName,
      userName: e.customerName,
      summary: `${e.problem} — order ${e.orderId}`,
      priority: e.problem.toLowerCase().includes('never') ? 'critical' : 'high',
      recommendedAction:
        e.refundStatus.toLowerCase().includes('pending')
          ? 'Complete or review refund'
          : 'Contact customer and verify fulfillment/refund',
    }));

  return { insights, recommendations, highPriorityConversations };
}
