import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { FinanceBarChart } from '@/components/admin/finance/FinanceBarChart';
import { FinanceKpiGrid } from '@/components/admin/finance/FinanceKpiGrid';
import { FinanceSection } from '@/components/admin/finance/FinanceSection';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { isAdminUser } from '@/constants/adminUid';
import { fetchAdminPaymentTransactions } from '@/services/adminPaymentCenter';
import { fetchStripeTreasurySummary } from '@/services/adminStripeTreasury';
import { useAuth } from '@/services/AuthContext';
import {
  addFinanceExpense,
  archiveFinanceReport,
  buildBalanceSheet,
  buildCashFlow,
  buildCustomerSpending,
  buildEmoFinanceInsights,
  buildEmoFinanceRecommendations,
  buildFinanceKpis,
  buildFinancePdfText,
  buildFinanceSummaryCsv,
  buildPaymentAnalytics,
  buildProfitLoss,
  buildRefundAnalytics,
  buildRestaurantFinancials,
  buildRevenueAnalytics,
  buildTaxSummary,
  deleteFinanceExpense,
  detectFinanceExceptions,
  exportFinanceCsv,
  exportFinancePdfReport,
  filterFinancePayments,
  FINANCE_EXPENSE_CATEGORIES,
  formatCurrency,
  printFinanceReport,
  saveFinanceReport,
  subscribeFinanceExpenses,
  subscribeFinanceOrders,
  subscribeFinanceReports,
  summarizeFinanceOrders,
  sumFinanceExpenses,
  updateFinanceExpense,
} from '@/services/finance/FinanceService';
import type { AdminPaymentTransaction } from '@/types/adminPaymentTransaction';
import type {
  FinanceDateFilter,
  FinanceExpense,
  FinanceExpenseCategory,
  FinanceOrderRow,
  FinanceStoredReport,
} from '@/types/financeDashboard';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SectionId =
  | 'overview'
  | 'orders'
  | 'payments'
  | 'refunds'
  | 'exceptions'
  | 'restaurants'
  | 'customers'
  | 'expenses'
  | 'statements'
  | 'insights'
  | 'reports';

const FILTERS: { id: FinanceDateFilter; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'all', label: 'All' },
];

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Orders' },
  { id: 'payments', label: 'Payments' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'restaurants', label: 'Restaurants' },
  { id: 'customers', label: 'Customers' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'statements', label: 'P&L / Cash' },
  { id: 'insights', label: 'Emo AI' },
  { id: 'reports', label: 'Reports' },
];

export default function AdminFinanceDashboardScreen() {
  const { user, firestoreUserRole } = useAuth();
  const isAdmin = isAdminUser(user, firestoreUserRole);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<AdminPaymentTransaction[]>([]);
  const [orders, setOrders] = useState<FinanceOrderRow[]>([]);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [reports, setReports] = useState<FinanceStoredReport[]>([]);
  const [treasuryCash, setTreasuryCash] = useState<number | null>(null);
  const [treasuryPending, setTreasuryPending] = useState<number | null>(null);

  const [filter, setFilter] = useState<FinanceDateFilter>('month');
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<SectionId>('overview');
  const [orderPage, setOrderPage] = useState(0);
  const [sortKey, setSortKey] = useState<'date' | 'amount' | 'status'>('date');

  const [expenseModal, setExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<FinanceExpense | null>(null);
  const [expCategory, setExpCategory] = useState<FinanceExpenseCategory>('manual');
  const [expLabel, setExpLabel] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expNotes, setExpNotes] = useState('');
  const [expBusy, setExpBusy] = useState(false);
  const [previewReport, setPreviewReport] = useState<FinanceStoredReport | null>(null);

  const loadPayments = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [tx, treasury] = await Promise.all([
        fetchAdminPaymentTransactions(),
        fetchStripeTreasurySummary().catch(() => null),
      ]);
      setPayments(tx);
      if (treasury) {
        setTreasuryCash(
          typeof treasury.availableBalance === 'number'
            ? treasury.availableBalance
            : null,
        );
        setTreasuryPending(
          typeof treasury.pendingBalance === 'number'
            ? treasury.pendingBalance
            : null,
        );
      }
      setError(null);
    } catch (e) {
      setError(getReadableErrorMessageOr(e, 'Could not load finance data.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void loadPayments(false);
  }, [isAdmin, loadPayments]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    const unsubOrders = subscribeFinanceOrders(setOrders);
    const unsubExp = subscribeFinanceExpenses(setExpenses);
    const unsubRep = subscribeFinanceReports(setReports);
    const poll = setInterval(() => {
      void loadPayments(true);
    }, 60_000);
    return () => {
      unsubOrders();
      unsubExp();
      unsubRep();
      clearInterval(poll);
    };
  }, [isAdmin, loadPayments]);

  const filteredPayments = useMemo(
    () => filterFinancePayments(payments, filter, search),
    [payments, filter, search],
  );

  const orderStats = useMemo(() => summarizeFinanceOrders(orders), [orders]);
  const kpis = useMemo(
    () => buildFinanceKpis(filteredPayments, orderStats),
    [filteredPayments, orderStats],
  );
  const revenue = useMemo(
    () => buildRevenueAnalytics(filteredPayments),
    [filteredPayments],
  );
  const paymentAnalytics = useMemo(
    () => buildPaymentAnalytics(filteredPayments),
    [filteredPayments],
  );
  const refundAnalytics = useMemo(
    () => buildRefundAnalytics(filteredPayments),
    [filteredPayments],
  );
  const restaurants = useMemo(
    () => buildRestaurantFinancials(filteredPayments),
    [filteredPayments],
  );
  const customers = useMemo(
    () => buildCustomerSpending(filteredPayments),
    [filteredPayments],
  );
  const expenseTotal = useMemo(() => sumFinanceExpenses(expenses), [expenses]);
  const pl = useMemo(
    () => buildProfitLoss(filteredPayments, expenseTotal),
    [filteredPayments, expenseTotal],
  );
  const cashFlow = useMemo(
    () =>
      buildCashFlow(
        filteredPayments,
        expenseTotal,
        treasuryCash,
        treasuryPending,
      ),
    [filteredPayments, expenseTotal, treasuryCash, treasuryPending],
  );
  const balanceSheet = useMemo(
    () => buildBalanceSheet(cashFlow, pl),
    [cashFlow, pl],
  );
  const tax = useMemo(() => buildTaxSummary(filteredPayments), [filteredPayments]);
  const insights = useMemo(
    () =>
      buildEmoFinanceInsights(kpis, revenue, restaurants, paymentAnalytics),
    [kpis, revenue, restaurants, paymentAnalytics],
  );
  const recommendations = useMemo(
    () =>
      buildEmoFinanceRecommendations(
        kpis,
        refundAnalytics,
        restaurants,
        paymentAnalytics,
      ),
    [kpis, refundAnalytics, restaurants, paymentAnalytics],
  );

  const exceptions = useMemo(() => {
    const byOrder = new Map<
      string,
      {
        status: string;
        amount: number;
        transactionId: string;
        timestampMs: number | null;
      }
    >();
    for (const p of payments) {
      if (!p.orderId) continue;
      byOrder.set(p.orderId, {
        status: p.status,
        amount: p.amount,
        transactionId: p.stripePaymentIntentId,
        timestampMs: p.paidAtMs ?? p.createdAtMs,
      });
    }
    return detectFinanceExceptions(orders, byOrder);
  }, [orders, payments]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = orders;
    if (q) {
      rows = rows.filter((o) =>
        [o.id, o.customer, o.restaurant, o.meal, o.status, o.paymentStatus]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    const sorted = [...rows].sort((a, b) => {
      if (sortKey === 'amount') return b.totalAmount - a.totalAmount;
      if (sortKey === 'status') return a.status.localeCompare(b.status);
      return (b.dateMs ?? 0) - (a.dateMs ?? 0);
    });
    return sorted;
  }, [orders, search, sortKey]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pagedOrders = filteredOrders.slice(
    orderPage * pageSize,
    orderPage * pageSize + pageSize,
  );

  const openNewExpense = () => {
    setEditingExpense(null);
    setExpCategory('manual');
    setExpLabel('');
    setExpAmount('');
    setExpNotes('');
    setExpenseModal(true);
  };

  const openEditExpense = (e: FinanceExpense) => {
    setEditingExpense(e);
    setExpCategory(e.category);
    setExpLabel(e.label);
    setExpAmount(String(e.amount));
    setExpNotes(e.notes);
    setExpenseModal(true);
  };

  const saveExpense = async () => {
    const amount = parseFloat(expAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      showError('Enter a valid expense amount.');
      return;
    }
    setExpBusy(true);
    try {
      if (editingExpense) {
        await updateFinanceExpense(editingExpense.id, {
          category: expCategory,
          label: expLabel,
          amount,
          notes: expNotes,
        });
        showSuccess('Expense updated.');
      } else {
        await addFinanceExpense({
          category: expCategory,
          label: expLabel,
          amount,
          notes: expNotes,
        });
        showSuccess('Expense added.');
      }
      setExpenseModal(false);
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not save expense.'));
    } finally {
      setExpBusy(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      await exportFinanceCsv(
        'HalfOrder Finance Summary',
        buildFinanceSummaryCsv({ kpis, pl }),
      );
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Export failed.'));
    }
  };

  const handleExportPdf = async () => {
    try {
      const text = buildFinancePdfText({
        title: 'HalfOrder Financial Report',
        generatedAt: new Date(),
        kpis,
        pl,
        insights: insights.map((i) => i.text),
      });
      await exportFinancePdfReport(text);
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Export failed.'));
    }
  };

  const handlePrint = async () => {
    try {
      const text = buildFinancePdfText({
        title: 'HalfOrder Financial Report (Print)',
        generatedAt: new Date(),
        kpis,
        pl,
        insights: insights.map((i) => i.text),
      });
      await printFinanceReport(text);
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Print share failed.'));
    }
  };

  const generateReport = async (period: FinanceStoredReport['period']) => {
    try {
      const title = `${period.charAt(0).toUpperCase()}${period.slice(1)} Financial Report — ${new Date().toLocaleDateString()}`;
      const body = buildFinancePdfText({
        title,
        generatedAt: new Date(),
        kpis,
        pl,
        insights: insights.map((i) => i.text),
      });
      await saveFinanceReport({ title, period, body });
      showSuccess('Report saved.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not save report.'));
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.muted}>Admin access required.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Finance Dashboard"
        subtitle="Investor-ready financial operations"
        fallbackRoute={adminRoutes.home}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadPayments(true)}
            tintColor={COLORS.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.id}
              style={[styles.chip, filter === f.id && styles.chipOn]}
              onPress={() => setFilter(f.id)}
            >
              <Text style={[styles.chipText, filter === f.id && styles.chipTextOn]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <AppTextInput
          value={search}
          onChangeText={(t) => {
            setSearch(t);
            setOrderPage(0);
          }}
          placeholder="Search customer, restaurant, order, payment, refund…"
          placeholderTextColor={COLORS.textMuted}
          style={styles.search}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {SECTIONS.map((s) => (
            <Pressable
              key={s.id}
              style={[styles.chip, section === s.id && styles.chipOn]}
              onPress={() => setSection(s.id)}
            >
              <Text
                style={[styles.chipText, section === s.id && styles.chipTextOn]}
              >
                {s.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.exportRow}>
          <Pressable style={styles.exportBtn} onPress={() => void handleExportCsv()}>
            <Text style={styles.exportBtnText}>CSV / Excel</Text>
          </Pressable>
          <Pressable style={styles.exportBtn} onPress={() => void handleExportPdf()}>
            <Text style={styles.exportBtnText}>PDF Report</Text>
          </Pressable>
          <Pressable style={styles.exportBtn} onPress={() => void handlePrint()}>
            <Text style={styles.exportBtnText}>Print</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}

        {!loading && section === 'overview' ? (
          <>
            <FinanceSection title="Top KPIs" subtitle="Live from payments & orders">
              <FinanceKpiGrid kpis={kpis} />
            </FinanceSection>
            <FinanceSection title="Revenue Analytics">
              <Text style={styles.meta}>
                Growth {revenue.growthPct >= 0 ? '+' : ''}
                {revenue.growthPct.toFixed(1)}% · Trend {revenue.trendLabel}
              </Text>
              <FinanceBarChart title="Daily Revenue" points={revenue.daily} />
              <FinanceBarChart title="Weekly Revenue" points={revenue.weekly} />
              <FinanceBarChart title="Monthly Revenue" points={revenue.monthly} />
              <FinanceBarChart title="Yearly Revenue" points={revenue.yearly} />
            </FinanceSection>
          </>
        ) : null}

        {!loading && section === 'orders' ? (
          <FinanceSection title="Order Financials">
            <View style={styles.chipRow}>
              {(['date', 'amount', 'status'] as const).map((k) => (
                <Pressable
                  key={k}
                  style={[styles.chip, sortKey === k && styles.chipOn]}
                  onPress={() => setSortKey(k)}
                >
                  <Text
                    style={[styles.chipText, sortKey === k && styles.chipTextOn]}
                  >
                    Sort: {k}
                  </Text>
                </Pressable>
              ))}
            </View>
            {pagedOrders.map((o) => (
              <View key={o.id} style={styles.rowCard}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {o.id}
                </Text>
                <Text style={styles.rowMeta}>
                  {o.customer} · {o.restaurant}
                </Text>
                <Text style={styles.rowMeta}>{o.meal}</Text>
                <Text style={styles.rowValue}>
                  Total {formatCurrency(o.totalAmount)} · Split{' '}
                  {formatCurrency(o.splitAmount)}
                </Text>
                <Text style={styles.rowMeta}>
                  Fee {formatCurrency(o.platformFee)} · Delivery{' '}
                  {formatCurrency(o.deliveryFee)} · Net{' '}
                  {formatCurrency(o.netRevenue)}
                </Text>
                <Text style={styles.rowMeta}>
                  {o.status} · {o.paymentStatus}
                  {o.dateMs
                    ? ` · ${new Date(o.dateMs).toLocaleString()}`
                    : ''}
                </Text>
              </View>
            ))}
            <View style={styles.pager}>
              <Pressable
                style={styles.chip}
                disabled={orderPage <= 0}
                onPress={() => setOrderPage((p) => Math.max(0, p - 1))}
              >
                <Text style={styles.chipText}>Prev</Text>
              </Pressable>
              <Text style={styles.meta}>
                Page {orderPage + 1} / {pageCount}
              </Text>
              <Pressable
                style={styles.chip}
                disabled={orderPage >= pageCount - 1}
                onPress={() =>
                  setOrderPage((p) => Math.min(pageCount - 1, p + 1))
                }
              >
                <Text style={styles.chipText}>Next</Text>
              </Pressable>
            </View>
          </FinanceSection>
        ) : null}

        {!loading && section === 'payments' ? (
          <FinanceSection title="Payment Analytics">
            <View style={styles.grid2}>
              <Metric
                label="Successful"
                value={String(paymentAnalytics.successful)}
              />
              <Metric label="Failed" value={String(paymentAnalytics.failed)} />
              <Metric label="Pending" value={String(paymentAnalytics.pending)} />
              <Metric
                label="Refunded"
                value={String(paymentAnalytics.refunded)}
              />
              <Metric
                label="Stripe Fees"
                value={formatCurrency(paymentAnalytics.stripeFees)}
              />
              <Metric
                label="Net Received"
                value={formatCurrency(paymentAnalytics.netReceived)}
              />
              <Metric
                label="Avg Payment"
                value={formatCurrency(paymentAnalytics.averagePayment)}
              />
              <Metric
                label="Success Rate"
                value={`${paymentAnalytics.successRate.toFixed(1)}%`}
              />
            </View>
          </FinanceSection>
        ) : null}

        {!loading && section === 'refunds' ? (
          <FinanceSection title="Refund Center">
            <View style={styles.grid2}>
              <Metric
                label="Total Refunds"
                value={formatCurrency(refundAnalytics.totalRefundAmount)}
              />
              <Metric
                label="Pending"
                value={String(refundAnalytics.pendingCount)}
              />
              <Metric
                label="Completed"
                value={String(refundAnalytics.completedCount)}
              />
              <Metric
                label="Refund Rate"
                value={`${refundAnalytics.refundRate.toFixed(1)}%`}
              />
            </View>
            {refundAnalytics.reasons.map((r) => (
              <Text key={r.reason} style={styles.meta}>
                {r.reason}: {r.count}
              </Text>
            ))}
            <FinanceBarChart
              title="Refund Timeline"
              points={refundAnalytics.timeline}
            />
            {refundAnalytics.history.map((h) => (
              <View key={h.id} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{h.customer}</Text>
                <Text style={styles.rowValue}>{formatCurrency(h.amount)}</Text>
                <Text style={styles.rowMeta}>
                  {h.status} · {h.reason}
                </Text>
              </View>
            ))}
          </FinanceSection>
        ) : null}

        {!loading && section === 'exceptions' ? (
          <FinanceSection
            title="Payment Exceptions"
            subtitle="Paid orders with operational risk"
          >
            {exceptions.length === 0 ? (
              <Text style={styles.muted}>No exceptions detected.</Text>
            ) : (
              exceptions.map((ex) => (
                <View key={`${ex.orderId}-${ex.issue}`} style={styles.alertCard}>
                  <Text style={styles.rowTitle}>{ex.orderId}</Text>
                  <Text style={styles.alertIssue}>{ex.issue}</Text>
                  <Text style={styles.rowMeta}>
                    {ex.customer} · {ex.restaurant} · {ex.meal}
                  </Text>
                  <Text style={styles.rowValue}>
                    {formatCurrency(ex.amount)} · Pay {ex.paymentStatus} · Refund{' '}
                    {ex.refundStatus}
                  </Text>
                  <Text style={styles.rowMeta}>
                    Resolution: {ex.resolution}
                  </Text>
                  <Text style={styles.rowMeta}>
                    Tx {ex.transactionId || '—'}
                    {ex.timestampMs
                      ? ` · ${new Date(ex.timestampMs).toLocaleString()}`
                      : ''}
                  </Text>
                </View>
              ))
            )}
          </FinanceSection>
        ) : null}

        {!loading && section === 'restaurants' ? (
          <FinanceSection title="Restaurant Financials">
            {restaurants.map((r) => (
              <View key={r.restaurantId} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{r.name}</Text>
                <Text style={styles.rowValue}>
                  {formatCurrency(r.revenue)} · {r.orders} orders
                </Text>
                <Text style={styles.rowMeta}>
                  AOV {formatCurrency(r.aov)} · Split {formatCurrency(r.avgSplit)}
                </Text>
                <Text style={styles.rowMeta}>
                  Refund {r.refundRate.toFixed(1)}% · Top:{' '}
                  {r.topMeals.join(', ') || '—'}
                </Text>
              </View>
            ))}
          </FinanceSection>
        ) : null}

        {!loading && section === 'customers' ? (
          <FinanceSection title="Customer Spending">
            {customers.map((c) => (
              <View key={c.customerId} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{c.name}</Text>
                <Text style={styles.rowValue}>
                  Lifetime {formatCurrency(c.lifetimeSpend)}
                </Text>
                <Text style={styles.rowMeta}>
                  {c.totalOrders} orders · AOV {formatCurrency(c.aov)} · Refunds{' '}
                  {c.refundCount}
                </Text>
              </View>
            ))}
          </FinanceSection>
        ) : null}

        {!loading && section === 'expenses' ? (
          <FinanceSection title="Expenses">
            <Text style={styles.meta}>
              Total operating expenses: {formatCurrency(expenseTotal)}
            </Text>
            <Pressable style={styles.primaryBtn} onPress={openNewExpense}>
              <Text style={styles.primaryBtnText}>Add Expense</Text>
            </Pressable>
            {expenses.map((e) => (
              <View key={e.id} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{e.label}</Text>
                <Text style={styles.rowValue}>{formatCurrency(e.amount)}</Text>
                <Text style={styles.rowMeta}>
                  {FINANCE_EXPENSE_CATEGORIES.find((c) => c.id === e.category)
                    ?.label ?? e.category}
                </Text>
                {e.notes ? <Text style={styles.rowMeta}>{e.notes}</Text> : null}
                <View style={styles.exportRow}>
                  <Pressable
                    style={styles.chip}
                    onPress={() => openEditExpense(e)}
                  >
                    <Text style={styles.chipText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={styles.chip}
                    onPress={() => {
                      void deleteFinanceExpense(e.id)
                        .then(() => showSuccess('Expense deleted.'))
                        .catch((err) =>
                          showError(
                            getReadableErrorMessageOr(err, 'Delete failed.'),
                          ),
                        );
                    }}
                  >
                    <Text style={styles.chipText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </FinanceSection>
        ) : null}

        {!loading && section === 'statements' ? (
          <>
            <FinanceSection title="Profit & Loss">
              <View style={styles.grid2}>
                <Metric label="Gross Revenue" value={formatCurrency(pl.grossRevenue)} />
                <Metric
                  label="Platform Revenue"
                  value={formatCurrency(pl.platformRevenue)}
                />
                <Metric
                  label="Operating Expenses"
                  value={formatCurrency(pl.operatingExpenses)}
                />
                <Metric label="Refunds" value={formatCurrency(pl.refunds)} />
                <Metric label="Net Revenue" value={formatCurrency(pl.netRevenue)} />
                <Metric label="Net Profit" value={formatCurrency(pl.netProfit)} />
                <Metric
                  label="Profit Margin"
                  value={`${pl.profitMargin.toFixed(1)}%`}
                />
              </View>
            </FinanceSection>
            <FinanceSection title="Cash Flow">
              <View style={styles.grid2}>
                <Metric label="Money In" value={formatCurrency(cashFlow.moneyIn)} />
                <Metric label="Money Out" value={formatCurrency(cashFlow.moneyOut)} />
                <Metric
                  label="Current Balance"
                  value={formatCurrency(cashFlow.currentBalance)}
                />
                <Metric
                  label="Pending Balance"
                  value={formatCurrency(cashFlow.pendingBalance)}
                />
                <Metric
                  label="Expected In"
                  value={formatCurrency(cashFlow.expectedIncoming)}
                />
                <Metric
                  label="Expected Out"
                  value={formatCurrency(cashFlow.expectedOutgoing)}
                />
              </View>
            </FinanceSection>
            <FinanceSection title="Balance Sheet">
              <View style={styles.grid2}>
                <Metric label="Assets" value={formatCurrency(balanceSheet.assets)} />
                <Metric label="Cash" value={formatCurrency(balanceSheet.cash)} />
                <Metric
                  label="Receivable"
                  value={formatCurrency(balanceSheet.accountsReceivable)}
                />
                <Metric
                  label="Liabilities"
                  value={formatCurrency(balanceSheet.liabilities)}
                />
                <Metric
                  label="Payable"
                  value={formatCurrency(balanceSheet.accountsPayable)}
                />
                <Metric label="Equity" value={formatCurrency(balanceSheet.equity)} />
                <Metric
                  label="Net Assets"
                  value={formatCurrency(balanceSheet.netAssets)}
                />
              </View>
            </FinanceSection>
            <FinanceSection title="Tax Summary">
              <View style={styles.grid2}>
                <Metric
                  label="Taxable Revenue"
                  value={formatCurrency(tax.taxableRevenue)}
                />
                <Metric
                  label="Collected Taxes (est.)"
                  value={formatCurrency(tax.collectedTaxes)}
                />
                <Metric
                  label="Estimated Taxes"
                  value={formatCurrency(tax.estimatedTaxes)}
                />
              </View>
              <Pressable
                style={styles.exportBtn}
                onPress={() =>
                  void exportFinanceCsv(
                    'Tax Summary',
                    [
                      'Metric,Value',
                      `Taxable Revenue,${tax.taxableRevenue.toFixed(2)}`,
                      `Collected Taxes,${tax.collectedTaxes.toFixed(2)}`,
                      `Estimated Taxes,${tax.estimatedTaxes.toFixed(2)}`,
                    ].join('\n'),
                  )
                }
              >
                <Text style={styles.exportBtnText}>Export Tax Summary</Text>
              </Pressable>
            </FinanceSection>
          </>
        ) : null}

        {!loading && section === 'insights' ? (
          <>
            <FinanceSection title="Emo AI Financial Insights">
              {insights.map((i) => (
                <View key={i.id} style={styles.rowCard}>
                  <Text style={styles.rowMeta}>{i.text}</Text>
                </View>
              ))}
            </FinanceSection>
            <FinanceSection title="Emo AI Recommendations">
              {recommendations.map((r) => (
                <View key={r.id} style={styles.rowCard}>
                  <Text style={styles.rowMeta}>{r.text}</Text>
                </View>
              ))}
            </FinanceSection>
          </>
        ) : null}

        {!loading && section === 'reports' ? (
          <FinanceSection title="Financial Reports">
            <View style={styles.exportRow}>
              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => (
                <Pressable
                  key={p}
                  style={styles.exportBtn}
                  onPress={() => void generateReport(p)}
                >
                  <Text style={styles.exportBtnText}>Generate {p}</Text>
                </Pressable>
              ))}
            </View>
            {reports
              .filter((r) => !r.archived)
              .map((r) => (
                <View key={r.id} style={styles.rowCard}>
                  <Text style={styles.rowTitle}>{r.title}</Text>
                  <Text style={styles.rowMeta}>
                    {r.period}
                    {r.createdAtMs
                      ? ` · ${new Date(r.createdAtMs).toLocaleString()}`
                      : ''}
                  </Text>
                  <View style={styles.exportRow}>
                    <Pressable
                      style={styles.chip}
                      onPress={() => setPreviewReport(r)}
                    >
                      <Text style={styles.chipText}>Preview</Text>
                    </Pressable>
                    <Pressable
                      style={styles.chip}
                      onPress={() => void exportFinancePdfReport(r.body)}
                    >
                      <Text style={styles.chipText}>Download</Text>
                    </Pressable>
                    <Pressable
                      style={styles.chip}
                      onPress={() =>
                        void archiveFinanceReport(r.id)
                          .then(() => showSuccess('Archived.'))
                          .catch((err) =>
                            showError(
                              getReadableErrorMessageOr(err, 'Archive failed.'),
                            ),
                          )
                      }
                    >
                      <Text style={styles.chipText}>Archive</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
          </FinanceSection>
        ) : null}
      </ScrollView>

      <Modal visible={expenseModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.rowTitle}>
              {editingExpense ? 'Edit Expense' : 'Add Expense'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {FINANCE_EXPENSE_CATEGORIES.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[styles.chip, expCategory === c.id && styles.chipOn]}
                    onPress={() => setExpCategory(c.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        expCategory === c.id && styles.chipTextOn,
                      ]}
                    >
                      {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <AppTextInput
              value={expLabel}
              onChangeText={setExpLabel}
              placeholder="Label"
              placeholderTextColor={COLORS.textMuted}
              style={styles.search}
            />
            <AppTextInput
              value={expAmount}
              onChangeText={setExpAmount}
              placeholder="Amount"
              keyboardType="decimal-pad"
              placeholderTextColor={COLORS.textMuted}
              style={styles.search}
            />
            <AppTextInput
              value={expNotes}
              onChangeText={setExpNotes}
              placeholder="Notes"
              placeholderTextColor={COLORS.textMuted}
              style={styles.search}
            />
            <View style={styles.exportRow}>
              <Pressable
                style={styles.chip}
                onPress={() => setExpenseModal(false)}
              >
                <Text style={styles.chipText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void saveExpense()}
                disabled={expBusy}
              >
                <Text style={styles.primaryBtnText}>
                  {expBusy ? 'Saving…' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!previewReport} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '80%' }]}>
            <Text style={styles.rowTitle}>{previewReport?.title}</Text>
            <ScrollView>
              <Text style={styles.rowMeta}>{previewReport?.body}</Text>
            </ScrollView>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setPreviewReport(null)}
            >
              <Text style={styles.primaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  content: { padding: 16, paddingBottom: 48 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipOn: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(168,85,247,0.16)',
  },
  chipText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: COLORS.text },
  search: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    marginBottom: 10,
  },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  exportBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exportBtnText: { color: COLORS.onPrimary, fontWeight: '700', fontSize: 12 },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: COLORS.onPrimary, fontWeight: '800' },
  meta: { color: COLORS.textMuted, fontWeight: '600', marginBottom: 8 },
  muted: { color: COLORS.textMuted, fontWeight: '600' },
  error: { color: COLORS.error, fontWeight: '700', marginVertical: 12 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: {
    ...adminCardShell,
    width: '47%',
    flexGrow: 1,
    minWidth: 140,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  value: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginTop: 6 },
  rowCard: {
    ...adminCardShell,
    marginBottom: 10,
  },
  alertCard: {
    ...adminCardShell,
    marginBottom: 10,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  alertIssue: {
    color: COLORS.error,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 4,
  },
  rowTitle: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  rowValue: { color: COLORS.text, fontWeight: '700', marginTop: 4 },
  rowMeta: { color: COLORS.textMuted, fontWeight: '600', marginTop: 3, fontSize: 12 },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
