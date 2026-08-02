import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import {
  saveEarningsWalletConfig,
  subscribeEarningsWalletConfig,
} from '@/services/earningsWalletConfig';
import { useAuth } from '@/services/AuthContext';
import type { EarningsWalletConfig } from '@/types/earningsWallet';
import { DEFAULT_EARNINGS_WALLET_CONFIG } from '@/types/earningsWallet';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { requireRole } from '@/utils/requireRole';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function parseNum(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw.trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export default function AdminWalletConfigScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const { user } = useAuth();
  const [config, setConfig] = useState<EarningsWalletConfig>(DEFAULT_EARNINGS_WALLET_CONFIG);
  const [restaurantCommission, setRestaurantCommission] = useState('15');
  const [driverCommission, setDriverCommission] = useState('20');
  const [bonusAmount, setBonusAmount] = useState('6');
  const [bonusEnabled, setBonusEnabled] = useState(true);
  const [serviceFee, setServiceFee] = useState('0');
  const [platformFeePercent, setPlatformFeePercent] = useState('0');
  const [deductions, setDeductions] = useState('0');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authorized) return undefined;
    return subscribeEarningsWalletConfig(
      (c) => {
        setConfig(c);
        setRestaurantCommission(String(c.restaurantCommissionPercent));
        setDriverCommission(String(c.driverCommissionPercent));
        setBonusAmount(String(c.deliveryBonusAmount));
        setBonusEnabled(c.deliveryBonusEnabled);
        setServiceFee(String(c.serviceFeeDefault));
        setPlatformFeePercent(String(c.platformFeePercent));
        setDeductions(String(c.restaurantDeductionsFlat));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [authorized]);

  const onSave = async () => {
    if (!user?.uid) return;
    setSaving(true);
    try {
      await saveEarningsWalletConfig(
        {
          restaurantCommissionPercent: parseNum(
            restaurantCommission,
            config.restaurantCommissionPercent,
          ),
          driverCommissionPercent: parseNum(
            driverCommission,
            config.driverCommissionPercent,
          ),
          deliveryBonusAmount: parseNum(bonusAmount, config.deliveryBonusAmount),
          deliveryBonusEnabled: bonusEnabled,
          serviceFeeDefault: parseNum(serviceFee, config.serviceFeeDefault),
          platformFeePercent: parseNum(platformFeePercent, config.platformFeePercent),
          restaurantDeductionsFlat: parseNum(deductions, config.restaurantDeductionsFlat),
        },
        user.uid,
      );
      showSuccess('Wallet settings saved. Applies to future orders only.');
    } catch (err) {
      showError(getUserFriendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  if (roleLoading || !authorized) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AdminHeader title="Wallet Configuration" fallbackRoute={adminRoutes.wallet} />
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.help}>
            Changes affect future order credits only. Completed ledger entries stay
            immutable.
          </Text>

          <Text style={styles.label}>Restaurant Commission %</Text>
          <AppTextInput
            value={restaurantCommission}
            onChangeText={setRestaurantCommission}
            keyboardType="decimal-pad"
            placeholder="15"
          />

          <Text style={styles.label}>Driver Commission % (admin cut of delivery fee)</Text>
          <AppTextInput
            value={driverCommission}
            onChangeText={setDriverCommission}
            keyboardType="decimal-pad"
            placeholder="20"
          />

          <Text style={styles.label}>Delivery Bonus Amount ($)</Text>
          <AppTextInput
            value={bonusAmount}
            onChangeText={setBonusAmount}
            keyboardType="decimal-pad"
            placeholder="6"
          />

          <View style={styles.switchRow}>
            <Text style={styles.labelInline}>Enable Delivery Bonus</Text>
            <Switch
              value={bonusEnabled}
              onValueChange={setBonusEnabled}
              trackColor={{ true: COLORS.primary }}
            />
          </View>

          <Text style={styles.label}>Default Service Fee ($)</Text>
          <AppTextInput
            value={serviceFee}
            onChangeText={setServiceFee}
            keyboardType="decimal-pad"
            placeholder="0"
          />

          <Text style={styles.label}>Platform Fee % (of food total)</Text>
          <AppTextInput
            value={platformFeePercent}
            onChangeText={setPlatformFeePercent}
            keyboardType="decimal-pad"
            placeholder="0"
          />

          <Text style={styles.label}>Restaurant Deductions Flat ($)</Text>
          <AppTextInput
            value={deductions}
            onChangeText={setDeductions}
            keyboardType="decimal-pad"
            placeholder="0"
          />

          <Pressable
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={onSave}
            disabled={saving}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save Settings'}</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  help: { color: '#8A829E', marginBottom: 8, lineHeight: 20 },
  label: { color: '#C4B5FD', fontWeight: '600', marginTop: 8 },
  labelInline: { color: '#C4B5FD', fontWeight: '600', flex: 1 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  saveBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
