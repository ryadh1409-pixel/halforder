import { useAuth } from '@/services/AuthContext';
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
import { showError, showSuccess } from '@/utils/toast';
import { doc, onSnapshot } from 'firebase/firestore';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  bg: '#000000',
  surface: '#171923',
  surfaceMuted: '#1E2230',
  text: '#FFFFFF',
  textSecondary: '#B7BDC9',
  textMuted: '#7D8493',
  border: 'rgba(255,255,255,0.08)',
  primary: '#A855F7',
  onPrimary: '#FFFFFF',
} as const;

export default function WalletScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid && !user.isAnonymous ? user.uid : null;

  const [balance, setBalance] = useState(0);
  const [cards, setCards] = useState<WalletCardPaymentMethod[]>([]);
  const [defaultPmId, setDefaultPmId] = useState<string | null>(null);
  const [vouchers, setVouchers] = useState<WalletRedeemedVoucher[]>([]);
  const [applePayAvailable, setApplePayAvailable] = useState(false);
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
      await loadCards();
      setLoading(false);
    })();

    return () => {
      unsubBalance();
      unsubVouchers();
      unsubDefault();
    };
  }, [uid, loadCards]);

  useFocusEffect(
    useCallback(() => {
      if (!uid) return;
      void loadCards();
    }, [uid, loadCards]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCards();
    setRefreshing(false);
  }, [loadCards]);

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
      showError(e instanceof Error ? e.message : getUserFriendlyError(e));
    } finally {
      setRedeemBusy(false);
    }
  };

  if (!uid) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
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
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>HalfOrder Balance</Text>
              <Text style={styles.balanceValue}>${balance.toFixed(2)}</Text>
              <Text style={styles.balanceHint}>
                Managed by HalfOrder · Admin credits only
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Payment methods</Text>
            <View style={styles.card}>
              {cards.length === 0 && !applePayAvailable ? (
                <Text style={styles.emptyText}>No payment methods yet.</Text>
              ) : null}

              {cards.map((pm) => {
                const expiry = formatCardExpiry(pm);
                const isDefault = defaultPmId === pm.id;
                return (
                  <TouchableOpacity
                    key={pm.id}
                    style={styles.methodRow}
                    onPress={() => router.push(`/wallet/card/${pm.id}` as never)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.methodIcon}>
                      <MaterialIcons
                        name="credit-card"
                        size={22}
                        color={PAL.primary}
                      />
                    </View>
                    <View style={styles.methodCopy}>
                      <Text style={styles.methodTitle}>{formatCardLabel(pm)}</Text>
                      <Text style={styles.methodSub}>
                        {[expiry, isDefault ? 'Default' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={22}
                      color={PAL.textMuted}
                    />
                  </TouchableOpacity>
                );
              })}

              {applePayAvailable ? (
                <View style={styles.methodRow}>
                  <View style={styles.methodIcon}>
                    <MaterialIcons
                      name="phone-iphone"
                      size={22}
                      color={PAL.text}
                    />
                  </View>
                  <View style={styles.methodCopy}>
                    <Text style={styles.methodTitle}>Apple Pay</Text>
                    <Text style={styles.methodSub}>Available on this iPhone</Text>
                  </View>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.addBtn}
                onPress={() =>
                  router.push('/wallet/add-payment-method' as never)
                }
                activeOpacity={0.9}
              >
                <MaterialIcons name="add" size={22} color={PAL.onPrimary} />
                <Text style={styles.addBtnText}>Add payment method</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Vouchers</Text>
            <View style={styles.card}>
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
                vouchers.map((v) => (
                  <View key={`${v.promoId}-${v.redeemedAtMs}`} style={styles.voucherRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.methodTitle}>{v.code}</Text>
                      <Text style={styles.methodSub}>
                        {formatVoucherValue(v)} · Ready for checkout
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
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
  balanceCard: {
    backgroundColor: PAL.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: PAL.border,
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: PAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  balanceValue: {
    marginTop: 10,
    fontSize: 40,
    fontWeight: '800',
    color: PAL.text,
    letterSpacing: -1,
  },
  balanceHint: {
    marginTop: 10,
    fontSize: 13,
    color: PAL.textMuted,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: PAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  card: {
    backgroundColor: PAL.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PAL.border,
    padding: 8,
    marginBottom: 28,
    overflow: 'hidden',
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: PAL.border,
  },
  methodIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: PAL.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodCopy: { flex: 1, minWidth: 0 },
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
  addBtn: {
    margin: 10,
    marginTop: 12,
    height: 52,
    borderRadius: 14,
    backgroundColor: PAL.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addBtnText: {
    color: PAL.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    padding: 16,
    fontSize: 14,
    color: PAL.textMuted,
    fontWeight: '500',
    lineHeight: 20,
  },
  voucherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
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
  voucherRow: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PAL.border,
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
