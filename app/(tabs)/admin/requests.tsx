import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { adminRoutes } from '@/constants/adminRoutes';
import { theme } from '@/constants/theme';
import {
  approvePartnerApplication,
  rejectPartnerApplication,
  subscribePendingPartnerApplications,
} from '@/services/partnerApplications';
import type { PartnerApplication } from '@/types/partnerApplication';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';
import { systemConfirm } from '@/components/SystemDialogHost';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatSubmittedAt(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
  });
}

function promptRejectionReason(): Promise<string | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Reject application',
        'Optional rejection reason (saved on the application).',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: (value?: string) =>
              resolve(typeof value === 'string' ? value : ''),
          },
        ],
        'plain-text',
      );
      return;
    }
    void systemConfirm({
      title: 'Reject application',
      message: 'Reject this application? You can leave the reason blank.',
      confirmLabel: 'Reject',
      destructive: true,
    }).then((ok) => resolve(ok ? '' : null));
  });
}

function RequestCard({
  item,
  busy,
  onApprove,
  onReject,
}: {
  item: PartnerApplication;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isDriver = item.type === 'driver';
  const typeLabel = isDriver ? 'Driver' : 'Restaurant';
  const typeIcon = isDriver ? 'car-outline' : 'storefront-outline';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.typePill}>
          <Ionicons name={typeIcon} size={14} color={COLORS.primary} />
          <Text style={styles.typePillText}>{typeLabel}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>Pending</Text>
        </View>
      </View>

      <Text style={styles.k}>Applicant Name</Text>
      <Text style={styles.v}>{item.applicantName || '—'}</Text>

      <Text style={styles.k}>Email</Text>
      <Text style={styles.v}>{item.email || '—'}</Text>

      <Text style={styles.k}>Phone Number</Text>
      <Text style={styles.v}>{item.phoneNumber || '—'}</Text>

      <Text style={styles.k}>Submission Date</Text>
      <Text style={styles.v}>{formatSubmittedAt(item.createdAtMs)}</Text>

      <Text style={styles.k}>Status</Text>
      <Text style={styles.v}>{item.status}</Text>

      {!isDriver ? (
        <>
          <Text style={styles.k}>Restaurant Name</Text>
          <Text style={styles.v}>{item.restaurantName || '—'}</Text>
          {item.address ? (
            <>
              <Text style={styles.k}>Address</Text>
              <Text style={styles.v}>{item.address}</Text>
            </>
          ) : null}
          {item.cuisine ? (
            <>
              <Text style={styles.k}>Cuisine</Text>
              <Text style={styles.v}>{item.cuisine}</Text>
            </>
          ) : null}
        </>
      ) : (
        <>
          <Text style={styles.k}>Driver information</Text>
          <Text style={styles.v}>
            {[item.applicantName, item.phoneNumber, item.email]
              .filter(Boolean)
              .join(' · ') || '—'}
          </Text>
        </>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.approveBtn]}
          disabled={busy}
          onPress={onApprove}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.approveText}>Approve</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.rejectBtn]}
          disabled={busy}
          onPress={onReject}
          activeOpacity={0.85}
        >
          <Text style={styles.rejectText}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AdminRequestsScreen() {
  const [rows, setRows] = useState<PartnerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    return subscribePendingPartnerApplications((next) => {
      setRows(next);
      setLoading(false);
    });
  }, []);

  const handleApprove = async (item: PartnerApplication) => {
    const ok = await systemConfirm({
      title: `Approve ${item.type} application?`,
      message: `Activate ${item.applicantName}'s ${item.type} account now?`,
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    setActingId(item.id);
    try {
      await approvePartnerApplication(item.id);
      showSuccess('Application approved.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (item: PartnerApplication) => {
    const reason = await promptRejectionReason();
    if (reason === null) return;
    setActingId(item.id);
    try {
      await rejectPartnerApplication(item.id, reason.trim() || null);
      showSuccess('Application rejected.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setActingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title={`Requests (${rows.length})`}
        subtitle="Pending driver & restaurant applications"
        fallbackRoute={adminRoutes.home}
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No pending requests.</Text>
          }
          renderItem={({ item }) => (
            <RequestCard
              item={item}
              busy={actingId === item.id}
              onApprove={() => void handleApprove(item)}
              onReject={() => void handleReject(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  empty: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
  },
  card: {
    ...adminCardShell,
    marginBottom: 14,
    padding: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  statusPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.accentAmber,
  },
  k: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  v: { fontSize: 15, color: COLORS.text, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  approveBtn: { backgroundColor: COLORS.successBg },
  approveText: { fontWeight: '800', color: COLORS.successText },
  rejectBtn: {
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  rejectText: { fontWeight: '800', color: COLORS.error },
});
