import {
  clearWalletDefaultPaymentMethodIfMatches,
  detachWalletPaymentMethod,
  formatCardExpiry,
  formatCardLabel,
  listWalletPaymentMethods,
  setWalletDefaultPaymentMethod,
  subscribeWalletDefaultPaymentMethodId,
  type WalletCardPaymentMethod,
} from '@/services/walletPaymentMethods';
import { useAuth } from '@/services/AuthContext';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { showError, showSuccess } from '@/utils/toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
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
  textMuted: '#7D8493',
  border: 'rgba(255,255,255,0.08)',
  primary: '#A855F7',
  onPrimary: '#FFFFFF',
  danger: '#EF4444',
} as const;

export default function WalletCardDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid && !user.isAnonymous ? user.uid : null;
  const params = useLocalSearchParams<{ id: string }>();
  const cardId = typeof params.id === 'string' ? params.id : '';

  const [card, setCard] = useState<WalletCardPaymentMethod | null>(null);
  const [defaultPmId, setDefaultPmId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!cardId) {
      setCard(null);
      setLoading(false);
      return;
    }
    try {
      const rows = await listWalletPaymentMethods();
      setCard(rows.find((r) => r.id === cardId) ?? null);
    } catch (e) {
      showError(getUserFriendlyError(e, { context: 'payment' }));
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeWalletDefaultPaymentMethodId(uid, setDefaultPmId);
  }, [uid]);

  const isDefault = !!card && defaultPmId === card.id;

  const onSetDefault = async () => {
    if (!card || busy) return;
    setBusy(true);
    try {
      await setWalletDefaultPaymentMethod(card.id);
      showSuccess('Default payment method updated.');
    } catch (e) {
      showError(getUserFriendlyError(e, { context: 'payment' }));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = () => {
    if (!card || busy) return;
    Alert.alert(
      'Remove card',
      `Remove ${formatCardLabel(card)} from your wallet?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await detachWalletPaymentMethod(card.id);
                await clearWalletDefaultPaymentMethodIfMatches(card.id);
                showSuccess('Card removed.');
                router.back();
              } catch (e) {
                showError(getUserFriendlyError(e, { context: 'payment' }));
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color={PAL.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Card</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={PAL.primary}
          style={{ marginTop: 48 }}
        />
      ) : !card ? (
        <View style={styles.centered}>
          <Text style={styles.hint}>Card not found.</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.infoCard}>
            <View style={styles.iconWrap}>
              <MaterialIcons name="credit-card" size={28} color={PAL.primary} />
            </View>
            <Text style={styles.cardTitle}>{formatCardLabel(card)}</Text>
            {formatCardExpiry(card) ? (
              <Text style={styles.cardSub}>{formatCardExpiry(card)}</Text>
            ) : null}
            <Text style={styles.defaultLabel}>
              {isDefault ? 'Default payment method' : 'Not default'}
            </Text>
          </View>

          {!isDefault ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void onSetDefault()}
              disabled={busy}
              activeOpacity={0.9}
            >
              {busy ? (
                <ActivityIndicator color={PAL.onPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Set as default</Text>
              )}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={onRemove}
            disabled={busy}
            activeOpacity={0.9}
          >
            <Text style={styles.dangerBtnText}>Remove card</Text>
          </TouchableOpacity>
        </View>
      )}
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
  body: { padding: 20 },
  infoCard: {
    backgroundColor: PAL.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: PAL.border,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: PAL.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: PAL.text,
  },
  cardSub: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    color: PAL.textMuted,
  },
  defaultLabel: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '700',
    color: PAL.primary,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: PAL.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    color: PAL.onPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  dangerBtn: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: {
    color: PAL.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hint: { fontSize: 16, color: PAL.textMuted },
});
