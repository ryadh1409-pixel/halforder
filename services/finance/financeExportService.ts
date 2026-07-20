import type { FinanceKpis, FinanceProfitLoss } from '@/types/financeDashboard';
import { formatCurrency } from '@/services/finance/financeAnalytics';
import { Share, Platform } from 'react-native';

/** CSV / Excel-compatible export via Share (same pattern as Payments Center). */
export async function exportFinanceCsv(
  filenameHint: string,
  csv: string,
): Promise<void> {
  await Share.share({
    message: csv,
    title: filenameHint,
  });
}

export function buildFinanceSummaryCsv(input: {
  kpis: FinanceKpis;
  pl: FinanceProfitLoss;
}): string {
  const lines = [
    'Metric,Value',
    `GMV,${input.kpis.gmv.toFixed(2)}`,
    `Platform Revenue,${input.kpis.platformRevenue.toFixed(2)}`,
    `Net Revenue,${input.kpis.netRevenue.toFixed(2)}`,
    `Total Orders,${input.kpis.totalOrders}`,
    `Completed Orders,${input.kpis.completedOrders}`,
    `Active Orders,${input.kpis.activeOrders}`,
    `Cancelled Orders,${input.kpis.cancelledOrders}`,
    `Failed Orders,${input.kpis.failedOrders}`,
    `Total Refunds,${input.kpis.totalRefundsAmount.toFixed(2)}`,
    `Successful Payments,${input.kpis.successfulPayments}`,
    `Failed Payments,${input.kpis.failedPayments}`,
    `AOV,${input.kpis.averageOrderValue.toFixed(2)}`,
    `Avg Split,${input.kpis.averageSplitValue.toFixed(2)}`,
    `Gross Revenue (P&L),${input.pl.grossRevenue.toFixed(2)}`,
    `Operating Expenses,${input.pl.operatingExpenses.toFixed(2)}`,
    `Net Profit,${input.pl.netProfit.toFixed(2)}`,
    `Profit Margin %,${input.pl.profitMargin.toFixed(2)}`,
  ];
  return lines.join('\n');
}

export function buildFinancePdfText(input: {
  title: string;
  generatedAt: Date;
  kpis: FinanceKpis;
  pl: FinanceProfitLoss;
  insights: string[];
}): string {
  const lines = [
    input.title,
    `Generated: ${input.generatedAt.toLocaleString()}`,
    Platform.OS,
    '',
    '=== KEY PERFORMANCE INDICATORS ===',
    `GMV: ${formatCurrency(input.kpis.gmv)}`,
    `Platform Revenue: ${formatCurrency(input.kpis.platformRevenue)}`,
    `Net Revenue: ${formatCurrency(input.kpis.netRevenue)}`,
    `Orders: ${input.kpis.totalOrders} (completed ${input.kpis.completedOrders}, active ${input.kpis.activeOrders})`,
    `Payments: ${input.kpis.successfulPayments} successful / ${input.kpis.failedPayments} failed`,
    `AOV: ${formatCurrency(input.kpis.averageOrderValue)}`,
    '',
    '=== PROFIT & LOSS ===',
    `Gross Revenue: ${formatCurrency(input.pl.grossRevenue)}`,
    `Platform Revenue: ${formatCurrency(input.pl.platformRevenue)}`,
    `Operating Expenses: ${formatCurrency(input.pl.operatingExpenses)}`,
    `Refunds: ${formatCurrency(input.pl.refunds)}`,
    `Net Profit: ${formatCurrency(input.pl.netProfit)}`,
    `Profit Margin: ${input.pl.profitMargin.toFixed(1)}%`,
    '',
    '=== EMO AI INSIGHTS ===',
    ...input.insights.map((t) => `• ${t}`),
    '',
    '— HalfOrder Finance Report —',
  ];
  return lines.join('\n');
}

export async function exportFinancePdfReport(text: string): Promise<void> {
  await Share.share({
    message: text,
    title: 'HalfOrder Finance Report',
  });
}

export async function printFinanceReport(text: string): Promise<void> {
  await Share.share({
    message: text,
    title: 'Print Finance Report',
  });
}
