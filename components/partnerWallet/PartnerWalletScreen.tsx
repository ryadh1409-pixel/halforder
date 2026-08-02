import { PartnerHalfOrderBalanceCard } from '@/components/partnerWallet/PartnerHalfOrderBalanceCard';
import { PartnerWalletCreditHistory } from '@/components/partnerWallet/PartnerWalletCreditHistory';
import {
  subscribePartnerWallet,
  subscribePartnerWalletCredits,
} from '@/services/halfOrderPartnerWallet';
import type {
  HalfOrderPartnerWallet,
  HalfOrderPartnerWalletCredit,
  PartnerWalletOwnerType,
} from '@/types/halfOrderPartnerWallet';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PAL = {
  bg: '#0B0816',
  text: '#FFFFFF',
  textMuted: '#7D8493',
  primary: '#A855F7',
};

type Props = {
  ownerType: PartnerWalletOwnerType;
  ownerId: string;
  title: string;
  orderIdLabel: string;
  emptyHistoryText: string;
};

export function PartnerWalletScreen({
  ownerType,
  ownerId,
  title,
  orderIdLabel,
  emptyHistoryText,
}: Props) {
  const [wallet, setWallet] = useState<HalfOrderPartnerWallet | null>(null);
  const [credits, setCredits] = useState<HalfOrderPartnerWalletCredit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) {
      setLoading(false);
      return undefined;
    }
    const unsubW = subscribePartnerWallet(
      ownerType,
      ownerId,
      (w) => {
        setWallet(w);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubC = subscribePartnerWalletCredits(ownerType, ownerId, setCredits);
    return () => {
      unsubW();
      unsubC();
    };
  }, [ownerType, ownerId]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={PAL.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <PartnerHalfOrderBalanceCard
            balance={wallet?.currentBalance ?? 0}
            updatedAt={wallet?.updatedAt ?? null}
          />
          <PartnerWalletCreditHistory
            credits={credits}
            orderIdLabel={orderIdLabel}
            emptyText={emptyHistoryText}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAL.bg },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: PAL.text,
    letterSpacing: -0.3,
  },
  scroll: { padding: 20, paddingBottom: 48 },
});
