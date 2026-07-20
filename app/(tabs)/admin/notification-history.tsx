import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  deletePushCampaign,
  resendPushCampaign,
  sendProfessionalPush,
  subscribePushCampaigns,
  type PushCampaign,
} from '@/services/adminPushCampaigns';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type StatusFilter = 'all' | PushCampaign['status'];

export default function NotificationHistoryScreen() {
  const [rows, setRows] = useState<PushCampaign[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d'>('all');

  useEffect(() => subscribePushCampaigns(setRows), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    const start =
      dateFilter === 'today'
        ? new Date().setHours(0, 0, 0, 0)
        : dateFilter === '7d'
          ? now - 7 * 86400000
          : 0;
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      const ms = r.createdAtMs ?? 0;
      if (start > 0 && ms < start) return false;
      if (!q) return true;
      return [r.title, r.body, r.category, r.id, r.deepLink]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, status, dateFilter]);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Notification History"
        subtitle="Delivery, opens, and resend"
        fallbackRoute={adminRoutes.pushCenter}
      />
      <View style={styles.toolbar}>
        <AppTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search campaigns…"
          placeholderTextColor={COLORS.textMuted}
          style={styles.search}
        />
        <View style={styles.chipRow}>
          {(['all', 'today', '7d'] as const).map((d) => (
            <Pressable
              key={d}
              style={[styles.chip, dateFilter === d && styles.chipOn]}
              onPress={() => setDateFilter(d)}
            >
              <Text
                style={[styles.chipText, dateFilter === d && styles.chipTextOn]}
              >
                {d === 'all' ? 'All dates' : d === 'today' ? 'Today' : '7 days'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.chipRow}>
          {(
            [
              'all',
              'delivered',
              'partial',
              'failed',
              'scheduled',
            ] as StatusFilter[]
          ).map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, status === s && styles.chipOn]}
              onPress={() => setStatus(s)}
            >
              <Text
                style={[styles.chipText, status === s && styles.chipTextOn]}
              >
                {s}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No push campaigns yet.</Text>
        }
        renderItem={({ item }) => {
          const deliveryRate =
            item.recipientCount > 0
              ? (item.deliveredCount / item.recipientCount) * 100
              : item.deliveredCount > 0
                ? 100
                : 0;
          return (
            <View style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body} numberOfLines={2}>
                {item.body}
              </Text>
              <Text style={styles.meta}>
                {item.category} · {item.status} ·{' '}
                {item.createdAtMs
                  ? new Date(item.createdAtMs).toLocaleString()
                  : '—'}
              </Text>
              <Text style={styles.meta}>
                Recipients {item.recipientCount} · Delivered{' '}
                {item.deliveredCount} · Failed {item.failedCount} · Opened{' '}
                {item.openedCount} · Rate {deliveryRate.toFixed(0)}%
              </Text>
              <View style={styles.actions}>
                <Pressable
                  style={styles.action}
                  onPress={() =>
                    void resendPushCampaign(item)
                      .then(() => showSuccess('Resent.'))
                      .catch((e) =>
                        showError(
                          getReadableErrorMessageOr(e, 'Resend failed.'),
                        ),
                      )
                  }
                >
                  <Text style={styles.actionText}>Resend</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() =>
                    void sendProfessionalPush({
                      title: item.title,
                      body: item.body,
                      imageUrl: item.imageUrl,
                      category: item.category,
                      deepLink: item.deepLink,
                      targetMode:
                        item.targetMode === 'all' ? 'all' : item.targetMode,
                      recipientUids: item.recipientUids.filter((u) => u !== '*'),
                    })
                      .then(() => showSuccess('Duplicated & sent.'))
                      .catch((e) =>
                        showError(
                          getReadableErrorMessageOr(e, 'Duplicate failed.'),
                        ),
                      )
                  }
                >
                  <Text style={styles.actionText}>Duplicate</Text>
                </Pressable>
                <Pressable
                  style={styles.actionDanger}
                  onPress={() =>
                    void deletePushCampaign(item.id)
                      .then(() => showSuccess('Deleted.'))
                      .catch((e) =>
                        showError(
                          getReadableErrorMessageOr(e, 'Delete failed.'),
                        ),
                      )
                  }
                >
                  <Text style={styles.actionDangerText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  toolbar: { paddingHorizontal: 16, paddingTop: 8 },
  search: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
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
  list: { padding: 16, paddingBottom: 24 },
  empty: { color: COLORS.textMuted, textAlign: 'center', marginTop: 40 },
  card: { ...adminCardShell, marginBottom: 10 },
  title: { color: COLORS.text, fontWeight: '800', fontSize: 16 },
  body: { color: COLORS.textMuted, fontWeight: '600', marginTop: 6 },
  meta: {
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 6,
    fontSize: 12,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(168,85,247,0.18)',
  },
  actionText: { color: COLORS.primary, fontWeight: '800', fontSize: 12 },
  actionDanger: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  actionDangerText: { color: COLORS.error, fontWeight: '800', fontSize: 12 },
});
