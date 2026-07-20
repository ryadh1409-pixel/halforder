import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  closeSupportConversation,
  markSupportReadByAdmin,
  reopenSupportConversation,
  resolveSupportConversation,
  statusLabel,
  subscribeAdminSupportConversations,
  type SupportConversation,
  type SupportConversationStatus,
} from '@/services/supportConversations';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { Image } from 'expo-image';
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

type StatusFilter = 'all' | SupportConversationStatus;

function formatWhen(ms: number | null): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function statusColor(status: SupportConversationStatus): string {
  if (status === 'open') return COLORS.primary;
  if (status === 'waiting') return '#F59E0B';
  if (status === 'resolved') return '#22C55E';
  return COLORS.textMuted;
}

export default function AdminSupportInboxScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<SupportConversation[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [filterUnread, setFilterUnread] = useState(false);

  useEffect(() => subscribeAdminSupportConversations(setRows), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (filterUnread && r.unreadAdmin <= 0) return false;
      if (!q) return true;
      return [
        r.userName,
        r.userEmail,
        r.userId,
        r.lastMessage,
        r.orderId,
        r.paymentId,
        r.complaintCategory,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, statusFilter, filterUnread]);

  const unreadTotal = rows.reduce((s, r) => s + (r.unreadAdmin > 0 ? 1 : 0), 0);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Support Inbox"
        subtitle={
          unreadTotal > 0
            ? `${unreadTotal} unread conversation${unreadTotal === 1 ? '' : 's'}`
            : `${rows.length} conversation${rows.length === 1 ? '' : 's'}`
        }
        fallbackRoute={adminRoutes.home}
      />
      <View style={styles.toolbar}>
        <AppTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, email, uid, order…"
          placeholderTextColor={COLORS.textMuted}
          style={styles.search}
        />
        <View style={styles.chipRow}>
          {(['all', 'open', 'waiting', 'closed', 'resolved'] as StatusFilter[]).map(
            (s) => (
              <Pressable
                key={s}
                style={[styles.chip, statusFilter === s && styles.chipOn]}
                onPress={() => setStatusFilter(s)}
              >
                <Text
                  style={[styles.chipText, statusFilter === s && styles.chipTextOn]}
                >
                  {s === 'all' ? 'All' : statusLabel(s)}
                </Text>
              </Pressable>
            ),
          )}
          <Pressable
            style={[styles.chip, filterUnread && styles.chipOn]}
            onPress={() => setFilterUnread((v) => !v)}
          >
            <Text style={[styles.chipText, filterUnread && styles.chipTextOn]}>
              Unread
            </Text>
          </Pressable>
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No support conversations yet. Customer messages and complaints
            appear here in real time.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, item.unreadAdmin > 0 && styles.cardUnread]}
            onPress={() => {
              void markSupportReadByAdmin(item.id).catch(() => {});
              router.push(adminRoutes.supportThread(item.id) as never);
            }}
          >
            <View style={styles.rowTop}>
              {item.userPhotoURL ? (
                <Image source={{ uri: item.userPhotoURL }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {(item.userName || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.cardMain}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.userName}
                  </Text>
                  {item.unreadAdmin > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.unreadAdmin}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.userEmail ?? item.userId}
                </Text>
                <Text style={styles.preview} numberOfLines={2}>
                  {item.lastMessage}
                </Text>
                <View style={styles.footerRow}>
                  <Text
                    style={[styles.statusPill, { color: statusColor(item.status) }]}
                  >
                    {statusLabel(item.status)}
                  </Text>
                  <Text style={styles.meta}>{formatWhen(item.updatedAtMs)}</Text>
                </View>
              </View>
            </View>
            {item.status !== 'closed' && item.status !== 'resolved' ? (
              <Pressable
                style={styles.archiveBtn}
                onPress={() =>
                  void closeSupportConversation(item.id)
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
                  void reopenSupportConversation(item.id)
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
  avatar: { width: 48, height: 48, borderRadius: 24 },
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
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 11 },
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
