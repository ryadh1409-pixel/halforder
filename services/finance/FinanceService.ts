/** Re-export facade — FinanceService entry for Admin Finance Dashboard. */
export * from '@/services/finance/financeAnalytics';
export * from '@/services/finance/financeOrders';
export {
  addFinanceExpense,
  deleteFinanceExpense,
  FINANCE_EXPENSE_CATEGORIES,
  subscribeFinanceExpenses,
  sumFinanceExpenses,
  updateFinanceExpense,
} from '@/services/finance/expenseService';
export {
  archiveFinanceReport,
  saveFinanceReport,
  subscribeFinanceReports,
} from '@/services/finance/financeReportService';
export {
  buildFinancePdfText,
  buildFinanceSummaryCsv,
  exportFinanceCsv,
  exportFinancePdfReport,
  printFinanceReport,
} from '@/services/finance/financeExportService';
