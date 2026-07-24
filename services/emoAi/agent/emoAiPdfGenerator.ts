/**
 * Professional executive report text/HTML for preview + PDF-ready export.
 * Investor-quality layout tokens — HalfOrder + Emo AI branding.
 */

import type { EmoAiExecutiveReport } from '@/types/emoAiAgent';

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function ts(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

/** Plain-text executive body (share / archive). */
export function renderEmoAiReportPlainText(
  report: Pick<
    EmoAiExecutiveReport,
    | 'title'
    | 'generatedAtMs'
    | 'period'
    | 'executiveSummary'
    | 'ordersAnalytics'
    | 'restaurantAnalytics'
    | 'paymentAnalytics'
    | 'paymentExceptions'
    | 'customerIssues'
    | 'conversationSummary'
    | 'highPriorityConversations'
    | 'insights'
    | 'recommendations'
    | 'userConversations'
  >,
): string {
  const e = report.executiveSummary;
  const lines: string[] = [
    '══════════════════════════════════════════',
    'HALFORDER × EMO AI — EXECUTIVE REPORT',
    report.title,
    `Generated: ${ts(report.generatedAtMs)}  |  AI Generated Badge ✓`,
    '══════════════════════════════════════════',
    '',
    '1. EXECUTIVE SUMMARY',
    `New Users: ${e.newUsers}`,
    `Active Users: ${e.activeUsers}`,
    `Returning Users: ${e.returningUsers}`,
    `New Orders: ${e.newOrders}`,
    `Completed Orders: ${e.completedOrders}`,
    `Cancelled Orders: ${e.cancelledOrders}`,
    `Failed Orders: ${e.failedOrders}`,
    `Revenue: ${money(e.revenue)}`,
    `Average Order Value: ${money(e.averageOrderValue)}`,
    `Average Split Value: ${money(e.averageSplitValue)}`,
    `Most Popular Restaurant: ${e.mostPopularRestaurant}`,
    `Most Popular Meal: ${e.mostPopularMeal}`,
    `Top Locations: ${e.topLocations.join(', ') || 'n/a'}`,
    '',
    '2. ORDERS ANALYTICS',
    `Total: ${report.ordersAnalytics.totalOrders}`,
    `Completed: ${report.ordersAnalytics.completed}`,
    `Pending: ${report.ordersAnalytics.pending}`,
    `Cancelled: ${report.ordersAnalytics.cancelled}`,
    `Failed: ${report.ordersAnalytics.failed}`,
    `Active: ${report.ordersAnalytics.active}`,
    `Split Completion Rate: ${pct(report.ordersAnalytics.splitCompletionRate)}`,
    '',
    '3. RESTAURANT ANALYTICS',
    'Most Popular:',
    ...report.restaurantAnalytics.mostPopular.map(
      (r) => `  - ${r.name}: ${r.orders} orders`,
    ),
    'Highest Revenue:',
    ...report.restaurantAnalytics.highestRevenue.map(
      (r) => `  - ${r.name}: ${money(r.revenue)}`,
    ),
    'Most Ordered Meals:',
    ...report.restaurantAnalytics.mostOrderedMeals.map(
      (m) => `  - ${m.name}: ${m.count}`,
    ),
    '',
    '4. PAYMENT ANALYTICS',
    `Successful: ${report.paymentAnalytics.successful}`,
    `Failed: ${report.paymentAnalytics.failed}`,
    `Pending: ${report.paymentAnalytics.pending}`,
    `Refunds: ${report.paymentAnalytics.refunds}`,
    `Revenue: ${money(report.paymentAnalytics.revenue)}`,
    `Average Payment: ${money(report.paymentAnalytics.averagePayment)}`,
    `Success Rate: ${pct(report.paymentAnalytics.successRate)}`,
    '',
    '⚠ 5. PAYMENT EXCEPTION REPORT (HIGH PRIORITY)',
    report.paymentExceptions.length
      ? report.paymentExceptions
          .map(
            (x) =>
              `  • ${x.orderId} | ${x.customerName} | ${x.restaurant} | ${x.meal} | ${money(x.amount)} | pay=${x.paymentStatus} | ${x.problem} | refund=${x.refundStatus} ${money(x.refundAmount)} | tx=${x.paymentTransactionId} | ${ts(x.orderTimeMs)} | ${x.location}`,
          )
          .join('\n')
      : '  None in period.',
    '',
    '6. CUSTOMER ISSUES',
    ...report.customerIssues.map(
      (i) => `  - ${i.label}: ${i.count} (${i.trendNote})`,
    ),
    '',
    '7. AI CONVERSATION SUMMARY (no full chats)',
    ...report.conversationSummary.map((c) => `  - ${c.count} × ${c.theme}`),
    '',
    '8. HIGH PRIORITY CONVERSATIONS',
    ...report.highPriorityConversations.map(
      (h) =>
        `  - [${h.priority}] ${h.userName}: ${h.summary} → ${h.recommendedAction}`,
    ),
    '',
    '9. AI INSIGHTS',
    ...report.insights.map((i) => `  • ${i}`),
    '',
    '10. AI RECOMMENDATIONS',
    ...report.recommendations.map((r) => `  → ${r}`),
    '',
    '11. USER CONVERSATIONS (Emo AI Chat)',
    ...(report.userConversations
      ? [
          `Conversations in period: ${report.userConversations.conversationCountInPeriod}`,
          `Active users: ${report.userConversations.analytics.activeUsers}`,
          `Avg messages/conversation: ${report.userConversations.analytics.averageMessagesPerConversation}`,
          `Daily / Weekly / Monthly: ${report.userConversations.analytics.dailyConversationCount} / ${report.userConversations.analytics.weeklyConversationCount} / ${report.userConversations.analytics.monthlyConversationCount}`,
          `High priority: ${report.userConversations.analytics.highPriorityCount}`,
          `Trending keywords: ${report.userConversations.insights.trendingKeywords.map((k) => k.name).join(', ') || 'n/a'}`,
          `Most requested restaurants: ${report.userConversations.insights.mostRequestedRestaurants.map((x) => `${x.name}(${x.count})`).join(', ') || 'n/a'}`,
          `Most requested meals: ${report.userConversations.insights.mostRequestedMeals.map((x) => `${x.name}(${x.count})`).join(', ') || 'n/a'}`,
          ...report.userConversations.highPriorityConversations
            .slice(0, 20)
            .map((h) => `  - ${h.userName}: ${h.title}`),
        ]
      : ['(no conversation data for this period)']),
    '',
    '— End of report — HalfOrder Emo AI',
  ];
  return lines.join('\n');
}

/** HTML document suitable for Print / Save as PDF on supported platforms. */
export function renderEmoAiReportHtml(
  report: Parameters<typeof renderEmoAiReportPlainText>[0],
): string {
  const e = report.executiveSummary;
  const kpi = (label: string, value: string) =>
    `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${report.title}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:0;background:#f8fafc;}
  .cover{background:linear-gradient(135deg,#0f172a,#4c1d95);color:#fff;padding:48px 40px;}
  .badge{display:inline-block;background:#a855f7;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.04em;}
  .wrap{padding:28px 40px 64px;}
  h1{font-size:28px;margin:12px 0 4px;}
  h2{font-size:18px;margin:28px 0 12px;color:#4c1d95;border-bottom:2px solid #e9d5ff;padding-bottom:6px;}
  .muted{opacity:.85;font-size:13px;}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
  .kpi{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;}
  .kpi-label{font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;}
  .kpi-value{font-size:20px;font-weight:800;margin-top:4px;}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;}
  th,td{padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:left;}
  th{background:#f1f5f9;font-size:11px;text-transform:uppercase;color:#475569;}
  .alert{background:#fef2f2;border:2px solid #ef4444;border-radius:14px;padding:16px;margin-top:8px;}
  .alert h2{color:#b91c1c;border-color:#fecaca;}
  footer{margin-top:40px;font-size:12px;color:#64748b;text-align:center;}
  ul{padding-left:18px;}
</style>
</head>
<body>
  <section class="cover">
    <div class="badge">AI GENERATED · EMO AI</div>
    <h1>HalfOrder Executive Report</h1>
    <div>${report.title}</div>
    <div class="muted">Generated ${ts(report.generatedAtMs)} · Period ${report.period}</div>
  </section>
  <div class="wrap">
    <h2>Executive Summary</h2>
    <div class="grid">
      ${kpi('New Users', String(e.newUsers))}
      ${kpi('Active Users', String(e.activeUsers))}
      ${kpi('Returning', String(e.returningUsers))}
      ${kpi('New Orders', String(e.newOrders))}
      ${kpi('Completed', String(e.completedOrders))}
      ${kpi('Cancelled', String(e.cancelledOrders))}
      ${kpi('Failed', String(e.failedOrders))}
      ${kpi('Revenue', money(e.revenue))}
      ${kpi('AOV', money(e.averageOrderValue))}
      ${kpi('Avg Split', money(e.averageSplitValue))}
      ${kpi('Top Restaurant', e.mostPopularRestaurant)}
      ${kpi('Top Meal', e.mostPopularMeal)}
    </div>
    <p class="muted">Top locations: ${e.topLocations.join(', ') || 'n/a'}</p>

    <h2>Orders Analytics</h2>
    <div class="grid">
      ${kpi('Total', String(report.ordersAnalytics.totalOrders))}
      ${kpi('Active', String(report.ordersAnalytics.active))}
      ${kpi('Split Completion', pct(report.ordersAnalytics.splitCompletionRate))}
    </div>

    <h2>Restaurant Analytics</h2>
    <table><tr><th>Restaurant</th><th>Orders</th></tr>
      ${report.restaurantAnalytics.mostPopular.map((r) => `<tr><td>${r.name}</td><td>${r.orders}</td></tr>`).join('')}
    </table>

    <h2>Payment Analytics</h2>
    <div class="grid">
      ${kpi('Successful', String(report.paymentAnalytics.successful))}
      ${kpi('Failed', String(report.paymentAnalytics.failed))}
      ${kpi('Refunds', String(report.paymentAnalytics.refunds))}
      ${kpi('Revenue', money(report.paymentAnalytics.revenue))}
      ${kpi('Avg Payment', money(report.paymentAnalytics.averagePayment))}
      ${kpi('Success Rate', pct(report.paymentAnalytics.successRate))}
    </div>

    <div class="alert">
      <h2>Payment Exception Report</h2>
      <p>Every paid order with an operational or refund issue.</p>
      <table>
        <tr><th>Order</th><th>Customer</th><th>Restaurant</th><th>Amount</th><th>Problem</th><th>Refund</th><th>Tx</th></tr>
        ${
          report.paymentExceptions.length
            ? report.paymentExceptions
                .map(
                  (x) =>
                    `<tr><td>${x.orderId}</td><td>${x.customerName}</td><td>${x.restaurant}</td><td>${money(x.amount)}</td><td>${x.problem}</td><td>${x.refundStatus} ${money(x.refundAmount)}</td><td>${x.paymentTransactionId}</td></tr>`,
                )
                .join('')
            : '<tr><td colspan="7">None in period</td></tr>'
        }
      </table>
    </div>

    <h2>Customer Issues</h2>
    <ul>${report.customerIssues.map((i) => `<li><strong>${i.label}</strong>: ${i.count} — ${i.trendNote}</li>`).join('')}</ul>

    <h2>AI Conversation Summary</h2>
    <ul>${report.conversationSummary.map((c) => `<li>${c.count} × ${c.theme}</li>`).join('')}</ul>

    <h2>High Priority Conversations</h2>
    <ul>${report.highPriorityConversations.map((h) => `<li><strong>[${h.priority}]</strong> ${h.userName}: ${h.summary} → ${h.recommendedAction}</li>`).join('')}</ul>

    <h2>AI Insights</h2>
    <ul>${report.insights.map((i) => `<li>${i}</li>`).join('')}</ul>

    <h2>AI Recommendations</h2>
    <ul>${report.recommendations.map((r) => `<li>${r}</li>`).join('')}</ul>

    <footer>HalfOrder · Emo AI Intelligence · Confidential · Page report</footer>
  </div>
</body>
</html>`;
}
