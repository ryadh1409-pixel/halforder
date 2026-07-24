import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  closeSupportTicket,
  reopenSupportTicket,
  subscribeAdminSupportTickets,
  supportTicketStatusLabel,
  supportTicketTypeLabel,
  type SupportTicket,
  type SupportTicketStatus,
} from '@/services/supportTickets';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type StatusFilter = 'all' | SupportTicketStatus;

function formatWhen(ms: number | null): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function statusColor(status: SupportTicketStatus): string {
  if (status === 'open') return COLORS.primary;
  return COLORS.textMuted;
}

export default function AdminSupportInboxScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<SupportTicket[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => subscribeAdminSupportTickets(setRows), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.userId, r.orderId, r.message, r.type, r.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, statusFilter]);

  const openCount = rows.filter((r) => r.status === 'open').length;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Support Inbox"
        subtitle={
          openCount > 0
            ? `${openCount} open ticket${openCount === 1 ? '' : 's'}`
            : `${rows.length} ticket${rows.length === 1 ? '' : 's'}`
        }
        fallbackRoute={adminRoutes.home}
      />
      <View style={styles.toolbar}>
        <AppTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search uid, order, message…"
          placeholderTextColor={COLORS.textMuted}
          style={styles.search}
        />
        <View style={styles.chipRow}>
          {(['all', 'open', 'closed'] as StatusFilter[]).map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, statusFilter === s && styles.chipOn]}
              onPress={() => setStatusFilter(s)}
            >
              <Text
                style={[styles.chipText, statusFilter === s && styles.chipTextOn]}
              >
                {s === 'all' ? 'All' : supportTicketStatusLabel(s)}
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
          <Text style={styles.empty}>
            No support tickets yet. Customer order Support chats appear here in
            real time.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, item.status === 'open' && styles.cardUnread]}
            onPress={() => {
              router.push(adminRoutes.supportThread(item.id) as never);
            }}
          >
            <View style={styles.rowTop}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                  {(item.userId || 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.cardMain}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {supportTicketTypeLabel(item.type)}
                  </Text>
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  User: {item.userId}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  Order: {item.orderId || '—'}
                </Text>
                <Text style={styles.preview} numberOfLines={2}>
                  {item.message}
                </Text>
                <View style={styles.footerRow}>
                  <Text
                    style={[styles.statusPill, { color: statusColor(item.status) }]}
                  >
                    {supportTicketStatusLabel(item.status)}
                  </Text>
                  <Text style={styles.meta}>
                    {formatWhen(item.updatedAtMs ?? item.createdAtMs)}
                  </Text>
                </View>
              </View>
            </View>
            {item.status !== 'closed' ? (
              <Pressable
                style={styles.archiveBtn}
                onPress={() =>
                  void closeSupportTicket(item.id)
                    .then(() => showSuccess('Closed.'))
                    .catch((e) =>
                      showError(getReadableErrorMessageOr(e, 'Close failed.')),
                    )
                }
              >
                <Text style={styles.archiveText}>Close</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.archiveBtn}
                onPress={() =>
                  void reopenSupportTicket(item.id)
                    .then(() => showSuccess('Reopened.'))
                    .catch((e) =>
                      showError(getReadableErrorMessageOr(e, 'Reopen failed.')),
                    )
                }
              >
                <Text style={styles.archiveText}>Reopen</Text>
              </Pressable>
            )}
          </Pressable>
        )}
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
  empty: { color: COLORS.textMuted, textAlign: 'center', marginTop: 40, lineHeight: 22 },
  card: { ...adminCardShell, marginBottom: 10 },
  cardUnread: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(168,85,247,0.10)',
  },
  rowTop: { flexDirection: 'row', gap: 12 },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: COLORS.text, fontWeight: '800', fontSize: 18 },
  cardMain: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, color: COLORS.text, fontWeight: '800', fontSize: 16 },
  meta: { color: COLORS.textMuted, fontWeight: '600', marginTop: 4, fontSize: 12 },
  preview: { color: COLORS.text, fontWeight: '600', marginTop: 8, lineHeight: 20 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 8,
  },
  statusPill: { fontWeight: '800', fontSize: 12 },
  archiveBtn: { alignSelf: 'flex-start', marginTop: 10 },
  archiveText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
});
