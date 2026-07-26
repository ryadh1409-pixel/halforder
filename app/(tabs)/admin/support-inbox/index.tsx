import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  closeSupportConversation,
  reopenSupportConversation,
  statusLabel,
  subscribeAdminSupportConversations,
  type SupportConversation,
  type SupportConversationStatus,
} from '@/services/supportConversations';
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

type InboxRow =
  | {
      key: string;
      source: 'conversation';
      updatedAtMs: number;
      conversation: SupportConversation;
    }
  | {
      key: string;
      source: 'ticket';
      updatedAtMs: number;
      ticket: SupportTicket;
    };

type StatusFilter = 'all' | 'open' | 'closed';

function formatWhen(ms: number | null): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function convNeedsAttention(status: SupportConversationStatus): boolean {
  return status === 'open' || status === 'reviewing' || status === 'waiting';
}

export default function AdminSupportInboxScreen() {
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => subscribeAdminSupportTickets(setTickets), []);
  useEffect(() => subscribeAdminSupportConversations(setConversations), []);

  const rows: InboxRow[] = useMemo(() => {
    const convRows: InboxRow[] = conversations.map((c) => ({
      key: `c:${c.id}`,
      source: 'conversation',
      updatedAtMs: c.updatedAtMs ?? c.createdAtMs ?? 0,
      conversation: c,
    }));
    const ticketRows: InboxRow[] = tickets.map((t) => ({
      key: `t:${t.id}`,
      source: 'ticket',
      updatedAtMs: t.updatedAtMs ?? t.createdAtMs ?? 0,
      ticket: t,
    }));
    return [...convRows, ...ticketRows].sort(
      (a, b) => b.updatedAtMs - a.updatedAtMs,
    );
  }, [conversations, tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.source === 'conversation') {
        const c = r.conversation;
        if (statusFilter === 'open' && !convNeedsAttention(c.status)) return false;
        if (statusFilter === 'closed' && c.status !== 'closed' && c.status !== 'resolved') {
          return false;
        }
        if (!q) return true;
        return [
          c.userId,
          c.userName,
          c.orderId,
          c.lastMessage,
          c.complaintCategory,
          c.referenceNumber,
          c.id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      }
      const t = r.ticket;
      if (statusFilter === 'open' && t.status !== 'open') return false;
      if (statusFilter === 'closed' && t.status !== 'closed') return false;
      if (!q) return true;
      return [t.userId, t.orderId, t.message, t.type, t.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, statusFilter]);

  const openCount =
    conversations.filter((c) => convNeedsAttention(c.status)).length +
    tickets.filter((t) => t.status === 'open').length;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Support Inbox"
        subtitle={
          openCount > 0
            ? `${openCount} open thread${openCount === 1 ? '' : 's'}`
            : `${rows.length} thread${rows.length === 1 ? '' : 's'}`
        }
        fallbackRoute={adminRoutes.home}
      />
      <View style={styles.toolbar}>
        <AppTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, uid, order, ref…"
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
                {s === 'all' ? 'All' : s === 'open' ? 'Open' : 'Closed'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No support threads yet. Customer Support chats and order Support
            tickets appear here in real time.
          </Text>
        }
        renderItem={({ item }) => {
          if (item.source === 'conversation') {
            const c = item.conversation;
            const unread = c.unreadAdmin > 0;
            return (
              <Pressable
                style={[styles.card, unread && styles.cardUnread]}
                onPress={() => {
                  router.push(adminRoutes.supportThread(c.id) as never);
                }}
              >
                <View style={styles.rowTop}>
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>
                      {(c.userName || 'U').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.cardMain}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {c.userName || 'Customer'}
                      </Text>
                      <Text style={styles.sourceTag}>Chat</Text>
                    </View>
                    <Text style={styles.meta} numberOfLines={1}>
                      {c.referenceNumber
                        ? `Ref ${c.referenceNumber}`
                        : c.complaintCategory || 'Customer support'}
                    </Text>
                    <Text style={styles.preview} numberOfLines={2}>
                      {c.lastMessage}
                    </Text>
                    <View style={styles.footerRow}>
                      <Text style={[styles.statusPill, { color: COLORS.primary }]}>
                        {statusLabel(c.status)}
                      </Text>
                      <Text style={styles.meta}>
                        {formatWhen(c.updatedAtMs ?? c.createdAtMs)}
                      </Text>
                    </View>
                  </View>
                </View>
                {c.status !== 'closed' && c.status !== 'resolved' ? (
                  <Pressable
                    style={styles.archiveBtn}
                    onPress={() =>
                      void closeSupportConversation(c.id)
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
                      void reopenSupportConversation(c.id)
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
            );
          }

          const t = item.ticket;
          return (
            <Pressable
              style={[styles.card, t.status === 'open' && styles.cardUnread]}
              onPress={() => {
                router.push(adminRoutes.supportThread(t.id) as never);
              }}
            >
              <View style={styles.rowTop}>
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {(t.userId || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.cardMain}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {supportTicketTypeLabel(t.type)}
                    </Text>
                    <Text style={styles.sourceTag}>Order</Text>
                  </View>
                  <Text style={styles.meta} numberOfLines={1}>
                    Customer: {t.userId}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    Order: {t.orderId || '—'}
                  </Text>
                  <Text style={styles.preview} numberOfLines={2}>
                    {t.message}
                  </Text>
                  <View style={styles.footerRow}>
                    <Text
                      style={[
                        styles.statusPill,
                        {
                          color:
                            t.status === 'open'
                              ? COLORS.primary
                              : COLORS.textMuted,
                        },
                      ]}
                    >
                      {supportTicketStatusLabel(t.status as SupportTicketStatus)}
                    </Text>
                    <Text style={styles.meta}>
                      {formatWhen(t.updatedAtMs ?? t.createdAtMs)}
                    </Text>
                  </View>
                </View>
              </View>
              {t.status !== 'closed' ? (
                <Pressable
                  style={styles.archiveBtn}
                  onPress={() =>
                    void closeSupportTicket(t.id)
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
                    void reopenSupportTicket(t.id)
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
  sourceTag: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
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
