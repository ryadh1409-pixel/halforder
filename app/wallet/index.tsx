import AppLogo from '@/components/AppLogo';
import {
  SettingsRow,
  SettingsSection,
} from '@/components/settings/SettingsList';
import { useCountUpValue } from '@/hooks/useCountUpValue';
import { useAuth } from '@/services/AuthContext';
import { getCashbackWallet } from '@/services/cashbackRewards';
import { parseHalfOrderBalance } from '@/services/halfOrderBalance';
import {
  formatCardExpiry,
  formatCardLabel,
  listWalletPaymentMethods,
  resolveApplePayAvailable,
  subscribeWalletDefaultPaymentMethodId,
  type WalletCardPaymentMethod,
} from '@/services/walletPaymentMethods';
import {
  formatVoucherValue,
  redeemVoucherToWallet,
  subscribeWalletRedeemedVouchers,
  type WalletRedeemedVoucher,
} from '@/services/walletVouchers';
import { db } from '@/services/firebase';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import type {
  CashbackTransaction,
  CashbackTransactionStatus,
  CashbackWallet,
} from '@/types/cashbackRewards';
import { showError, showSuccess } from '@/utils/toast';
import { doc, onSnapshot } from 'firebase/firestore';
import { goBackFromProfileScreen } from '@/lib/profileBack';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const PAL = {
  bg: '#0B0816',
  surface: '#151126',
  surfaceMuted: '#1E2230',
  text: '#FFFFFF',
  textSecondary: '#B7BDC9',
  textMuted: '#7D8493',
  border: 'rgba(255,255,255,0.08)',
  primary: '#A855F7',
  onPrimary: '#FFFFFF',
} as const;

function formatCad(amount: number): string {
  return `CA$${Math.max(0, amount).toFixed(2)}`;
}

function formatEarnedDate(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

function cashbackStatusLabel(status: CashbackTransactionStatus): string {
  switch (status) {
    case 'pending':
    case 'reserved':
      return 'Pending';
    case 'available':
      return 'Available';
    case 'redeemed':
      return 'Used';
    case 'expired':
      return 'Expired';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Pending';
  }
}

function statusTone(status: CashbackTransactionStatus): string {
  switch (status) {
    case 'available':
      return '#34D399';
    case 'pending':
    case 'reserved':
      return '#F59E0B';
    case 'redeemed':
      return PAL.primary;
    case 'expired':
    case 'cancelled':
      return PAL.textMuted;
    default:
      return PAL.textMuted;
  }
}

/**
 * Premium HalfOrder balance card — presentational only.
 * Memoized so the count-up frames never re-render the wallet lists below.
 */
const HalfOrderBalanceCard = memo(function HalfOrderBalanceCard({
  balance,
  cashAvailableCad,
  cashPendingCad,
}: {
  balance: number;
  cashAvailableCad: number;
  cashPendingCad: number;
}) {
  const displayBalance = useCountUpValue(balance, { durationMs: 900 });
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  return (
    <Animated.View
      style={[
        styles.cardShell,
        { opacity: entrance, transform: [{ translateY }] },
      ]}
      accessibilityRole="summary"
      accessibilityLabel={`HalfOrder balance ${balance.toFixed(
        2,
      )} dollars. Managed by HalfOrder, admin credits only. HalfOrder Cash current balance ${formatCad(
        cashAvailableCad,
      )}, pending cashback ${formatCad(cashPendingCad)}.`}
    >
      <LinearGradient
        colors={['#3B1873', '#25123F', '#140B23']}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardSurface}
      >
        {/* Decorative lighting, reflections and engraved arcs */}
        <View style={styles.cardGlowTop} pointerEvents="none" />
        <View style={styles.cardGlowBottom} pointerEvents="none" />
        <View style={styles.cardArcOuter} pointerEvents="none" />
        <View style={styles.cardArcInner} pointerEvents="none" />
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.16)',
            'rgba(255,255,255,0.04)',
            'transparent',
          ]}
          locations={[0, 0.42, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.95, y: 0.8 }}
          style={styles.cardSheen}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[
            'transparent',
            'rgba(255,255,255,0.34)',
            'transparent',
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cardTopEdge}
          pointerEvents="none"
        />
        <View style={styles.cardWatermark} pointerEvents="none">
          <AppLogo size={168} />
        </View>

        <Text style={styles.cardEyebrow} maxFontSizeMultiplier={1.2}>
          HALFORDER BALANCE
        </Text>

        <Text style={styles.cardBalance} maxFontSizeMultiplier={1.15}>
          {`CA$${displayBalance.toFixed(2)}`}
        </Text>

        <Text style={styles.cardFootnote} maxFontSizeMultiplier={1.25}>
          Managed by HalfOrder · Admin credits only
        </Text>

        <View style={styles.cardDivider} pointerEvents="none" />

        <Text style={styles.cardCashTitle} maxFontSizeMultiplier={1.2}>
          HalfOrder Cash
        </Text>
        <Text style={styles.cardCashSubtitle} maxFontSizeMultiplier={1.25}>
          Rewards you can spend on future orders
        </Text>

        <View style={styles.cardCashRow}>
          <Text style={styles.cardCashLabel} maxFontSizeMultiplier={1.25}>
            Current Balance
          </Text>
          <Text style={styles.cardCashValue} maxFontSizeMultiplier={1.2}>
            {formatCad(cashAvailableCad)}
          </Text>
        </View>

        <View style={styles.cardCashRow}>
          <Text style={styles.cardCashLabel} maxFontSizeMultiplier={1.25}>
            Pending Cashback
          </Text>
          <Text
            style={[styles.cardCashValue, styles.cardCashValuePending]}
            maxFontSizeMultiplier={1.2}
          >
            {formatCad(cashPendingCad)}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
});

export default function WalletScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid && !user.isAnonymous ? user.uid : null;

  const [balance, setBalance] = useState(0);
  const [cards, setCards] = useState<WalletCardPaymentMethod[]>([]);
  const [defaultPmId, setDefaultPmId] = useState<string | null>(null);
  const [vouchers, setVouchers] = useState<WalletRedeemedVoucher[]>([]);
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [cashback, setCashback] = useState<CashbackWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemBusy, setRedeemBusy] = useState(false);

  const loadCards = useCallback(async () => {
    if (!uid) {
      setCards([]);
      return;
    }
    try {
      const rows = await listWalletPaymentMethods();
      setCards(rows);
    } catch (e) {
      showError(getUserFriendlyError(e, { context: 'payment' }));
      setCards([]);
    }
  }, [uid]);

  const loadCashback = useCallback(async () => {
    if (!uid) {
      setCashback(null);
      return;
    }
    try {
      const wallet = await getCashbackWallet();
      setCashback(wallet);
    } catch {
      setCashback(null);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const unsubBalance = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        setBalance(
          parseHalfOrderBalance(snap.data() as Record<string, unknown> | undefined),
        );
      },
      () => undefined,
    );
    const unsubVouchers = subscribeWalletRedeemedVouchers(uid, setVouchers);
    const unsubDefault = subscribeWalletDefaultPaymentMethodId(uid, setDefaultPmId);

    void (async () => {
      const apple = await resolveApplePayAvailable();
      setApplePayAvailable(apple);
      await Promise.all([loadCards(), loadCashback()]);
      setLoading(false);
    })();

    return () => {
      unsubBalance();
      unsubVouchers();
      unsubDefault();
    };
  }, [uid, loadCards, loadCashback]);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      void loadCards();
      void loadCashback();
    }, [uid, loadCards, loadCashback]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadCards(), loadCashback()]);
    setRefreshing(false);
  }, [loadCards, loadCashback]);

  const cashbackHistory = useMemo(() => {
    const rows = cashback?.transactions ?? [];
    return rows.filter((row) => row.status !== 'cancelled');
  }, [cashback?.transactions]);

  const showCashbackDetails = cashback?.settings.visibleInUserApp !== false;

  const onRedeem = async () => {
    setRedeemBusy(true);
    try {
      const already = vouchers.some(
        (v) => v.code === redeemCode.trim().toUpperCase(),
      );
      if (already) {
        throw new Error('This voucher is already in your wallet.');
      }
      await redeemVoucherToWallet(redeemCode);
      showSuccess('Voucher added to your wallet.');
      setRedeemCode('');
      setRedeemOpen(false);
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setRedeemBusy(false);
    }
  };

  if (!uid) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => goBackFromProfileScreen(router)}
            hitSlop={12}
          >
            <MaterialIcons name="arrow-back" size={24} color={PAL.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Wallet</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Text style={styles.hint}>Sign in to view your wallet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackFromProfileScreen(router)}
          hitSlop={12}
        >
          <MaterialIcons name="arrow-back" size={24} color={PAL.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={PAL.primary}
          />
        }
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={PAL.primary}
            style={{ marginTop: 48 }}
          />
        ) : (
          <>
            <HalfOrderBalanceCard
              balance={balance}
              cashAvailableCad={cashback?.availableCad ?? 0}
              cashPendingCad={cashback?.pendingCad ?? 0}
            />

            <View style={styles.historySection}>
              {showCashbackDetails ? (
                <>
                  <Text style={styles.cashHistoryTitle}>Cashback History</Text>
                  {cashbackHistory.length === 0 ? (
                    <Text style={styles.emptyText}>
                      Cashback from completed orders will appear here.
                    </Text>
                  ) : (
                    cashbackHistory.map((row: CashbackTransaction) => {
                      const status = cashbackStatusLabel(row.status);
                      const orderLabel = row.orderId
                        ? row.orderId.slice(0, 8).toUpperCase()
                        : '—';
                      return (
                        <View key={row.id} style={styles.cashHistoryRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.methodTitle} numberOfLines={1}>
                              {row.restaurantName?.trim() || 'HalfOrder'}
                            </Text>
                            <Text style={styles.methodSub} numberOfLines={1}>
                              Order {orderLabel} ·{' '}
                              {formatEarnedDate(
                                row.createdAtMs ?? row.availableAtMs,
                              )}
                            </Text>
                          </View>
                          <View style={styles.cashHistoryRight}>
                            <Text style={styles.cashHistoryAmount}>
                              {row.type === 'redemption' ? '−' : '+'}
                              {formatCad(Math.abs(row.amountCad))}
                            </Text>
                            <Text
                              style={[
                                styles.cashHistoryStatus,
                                { color: statusTone(row.status) },
                              ]}
                            >
                              {status}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </>
              ) : (
                <Text style={styles.cashHiddenHint}>
                  Detailed cashback history is currently hidden.
                </Text>
              )}
            </View>

            <SettingsSection
              title="Payment methods"
              style={styles.listSection}
            >
              {cards.length === 0 && !applePayAvailable ? (
                <Text style={styles.emptyText}>No payment methods yet.</Text>
              ) : null}

              {cards.map((pm, index) => {
                const expiry = formatCardExpiry(pm);
                const isDefault = defaultPmId === pm.id;
                return (
                  <SettingsRow
                    key={pm.id}
                    title={formatCardLabel(pm)}
                    subtitle={
                      [expiry, isDefault ? 'Default' : null]
                        .filter(Boolean)
                        .join(' · ') || null
                    }
                    icon="credit-card"
                    onPress={() => router.push(`/wallet/card/${pm.id}` as never)}
                    showChevron
                    isFirst={index === 0}
                  />
                );
              })}

              {applePayAvailable ? (
                <SettingsRow
                  title="Apple Pay"
                  subtitle="Available on this iPhone"
                  icon="phone-iphone"
                  iconColor={PAL.text}
                  isFirst={cards.length === 0}
                />
              ) : null}

              <SettingsRow
                title="Add payment method"
                icon="add"
                tone="accent"
                onPress={() =>
                  router.push('/wallet/add-payment-method' as never)
                }
              />
            </SettingsSection>

            <SettingsSection title="Vouchers" style={styles.listSection}>
              <View style={styles.voucherHeader}>
                <Text style={styles.voucherCount}>
                  {vouchers.length} voucher{vouchers.length === 1 ? '' : 's'}
                </Text>
                <TouchableOpacity
                  style={styles.redeemBtn}
                  onPress={() => setRedeemOpen(true)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.redeemBtnText}>Redeem Voucher</Text>
                </TouchableOpacity>
              </View>

              {vouchers.length === 0 ? (
                <Text style={styles.emptyText}>
                  Redeem a code to save it for later checkout.
                </Text>
              ) : (
                vouchers.map((v, index) => (
                  <SettingsRow
                    key={`${v.promoId}-${v.redeemedAtMs}`}
                    title={v.code}
                    subtitle={`${formatVoucherValue(v)} · Ready for checkout`}
                    icon="confirmation-number"
                    isFirst={index === 0}
                  />
                ))
              )}
            </SettingsSection>
          </>
        )}
      </ScrollView>

      <Modal
        visible={redeemOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!redeemBusy) setRedeemOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Redeem voucher</Text>
            <Text style={styles.modalSub}>
              Enter an active HalfOrder voucher code.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={redeemCode}
              onChangeText={setRedeemCode}
              placeholder="VOUCHER CODE"
              placeholderTextColor={PAL.textMuted}
              autoCapitalize="characters"
              editable={!redeemBusy}
            />
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void onRedeem()}
              disabled={redeemBusy}
            >
              {redeemBusy ? (
                <ActivityIndicator color={PAL.onPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Redeem</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setRedeemOpen(false)}
              disabled={redeemBusy}
            >
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAL.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PAL.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: PAL.text,
    letterSpacing: -0.3,
  },
  scroll: { padding: 20, paddingBottom: 48 },
  cardShell: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,181,253,0.30)',
    overflow: 'hidden',
    marginBottom: 30,
    ...Platform.select({
      ios: {
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.34,
        shadowRadius: 26,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  cardSurface: {
    minHeight: 202,
    paddingHorizontal: 22,
    paddingVertical: 22,
    overflow: 'hidden',
  },
  cardGlowTop: {
    position: 'absolute',
    top: -132,
    right: -84,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(168,85,247,0.22)',
  },
  cardGlowBottom: {
    position: 'absolute',
    bottom: -150,
    left: -96,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(196,181,253,0.10)',
  },
  cardArcOuter: {
    position: 'absolute',
    right: -118,
    bottom: -128,
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardArcInner: {
    position: 'absolute',
    right: -74,
    bottom: -84,
    width: 212,
    height: 212,
    borderRadius: 106,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  cardTopEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  cardWatermark: {
    position: 'absolute',
    top: -34,
    right: -26,
    opacity: 0.07,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.62)',
    letterSpacing: 1.8,
  },
  cardBalance: {
    marginTop: 12,
    fontSize: 46,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1.6,
  },
  cardFootnote: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.52)',
    letterSpacing: 0.1,
  },
  cardDivider: {
    marginTop: 20,
    marginBottom: 18,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  cardCashTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  cardCashSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.52)',
    lineHeight: 16,
  },
  cardCashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
  },
  cardCashLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.66)',
  },
  cardCashValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  cardCashValuePending: {
    color: '#E9BE86',
  },
  historySection: {
    marginBottom: 24,
  },
  cashHistoryTitle: {
    marginBottom: 4,
    fontSize: 13,
    fontWeight: '800',
    color: PAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  cashHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PAL.border,
  },
  cashHistoryRight: { alignItems: 'flex-end' },
  cashHistoryAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: PAL.text,
  },
  cashHistoryStatus: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
  },
  cashHiddenHint: {
    fontSize: 13,
    fontWeight: '500',
    color: PAL.textMuted,
    lineHeight: 18,
  },
  listSection: {
    marginTop: 2,
    marginBottom: 24,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: PAL.text,
  },
  methodSub: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '500',
    color: PAL.textMuted,
  },
  emptyText: {
    paddingVertical: 14,
    fontSize: 14,
    color: PAL.textMuted,
    fontWeight: '500',
    lineHeight: 20,
  },
  voucherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 6,
  },
  voucherCount: {
    fontSize: 16,
    fontWeight: '800',
    color: PAL.text,
  },
  redeemBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: PAL.surfaceMuted,
    borderWidth: 1,
    borderColor: PAL.border,
  },
  redeemBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: PAL.primary,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hint: { fontSize: 16, color: PAL.textMuted },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: PAL.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: PAL.text,
  },
  modalSub: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: 14,
    color: PAL.textMuted,
    lineHeight: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: PAL.border,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    fontWeight: '700',
    color: PAL.text,
    backgroundColor: PAL.surfaceMuted,
    marginBottom: 16,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: PAL.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: PAL.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    marginTop: 10,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: PAL.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
});
