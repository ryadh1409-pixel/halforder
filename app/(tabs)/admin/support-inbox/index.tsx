import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import {
  conversationMatchesFilter,
  formatCreatedShort,
  formatSupportCategory,
  formatTicketNumber,
  friendlyStatus,
  priorityLabel,
  priorityTone,
  type AdminSupportFilter,
} from '@/components/support/supportDisplay';
import { SupportStatusChip } from '@/components/support/SupportStatusChip';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS, adminFontFamily } from '@/constants/adminTheme';
import {
  closeSupportConversation,
  reopenSupportConversation,
  subscribeAdminSupportConversations,
  type SupportConversation,
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

const FILTERS: { id: AdminSupportFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'replied', label: 'Replied' },
  { id: 'closed', label: 'Closed' },
  { id: 'high', label: 'High Priority' },
];

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaChipLabel}>{label}</Text>
      <Text style={styles.metaChipValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function AdminSupportInboxScreen() {
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdminSupportFilter>('all');

  useEffect(() => subscribeAdminSupportTickets(setTickets), []);
  useEffect(() => subscribeAdminSupportConversations(setConversations), []);

  const counts = useMemo(() => {
    const c = {
      all: conversations.length + tickets.length,
      new: 0,
      waiting: 0,
      replied: 0,
      closed: 0,
      high: 0,
    };
    for (const row of conversations) {
      if (conversationMatchesFilter(row, 'new')) c.new += 1;
      if (conversationMatchesFilter(row, 'waiting')) c.waiting += 1;
      if (conversationMatchesFilter(row, 'replied')) c.replied += 1;
      if (conversationMatchesFilter(row, 'closed')) c.closed += 1;
      if (conversationMatchesFilter(row, 'high')) c.high += 1;
    }
    for (const t of tickets) {
      if (t.status === 'open') c.new += 1;
      if (t.status === 'closed') c.closed += 1;
    }
    return c;
  }, [conversations, tickets]);

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
        if (!conversationMatchesFilter(c, statusFilter)) return false;
        if (!q) return true;
        return [
          c.userName,
          c.userEmail,
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
      if (statusFilter === 'closed' && t.status !== 'closed') return false;
      if (
        (statusFilter === 'new' || statusFilter === 'waiting' || statusFilter === 'replied') &&
        t.status !== 'open'
      ) {
        return false;
      }
      if (statusFilter === 'high') return false;
      if (!q) return true;
      return [t.userId, t.orderId, t.message, t.type, t.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, statusFilter]);

  const unreadBadge = conversations.reduce((n, c) => n + (c.unreadAdmin > 0 ? 1 : 0), 0);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Support Center"
        subtitle={
          unreadBadge > 0
            ? `${unreadBadge} unread · live`
            : `${rows.length} ticket${rows.length === 1 ? '' : 's'}`
        }
        fallbackRoute={adminRoutes.home}
      />
      <View style={styles.toolbar}>
        <AppTextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search customer, order, ticket…"
          placeholderTextColor={COLORS.textMuted}
          style={styles.search}
        />
        <View style={styles.chipRow}>
          {FILTERS.map((f) => {
            const count = counts[f.id];
            const on = statusFilter === f.id;
            return (
              <Pressable
                key={f.id}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setStatusFilter(f.id)}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {f.label}
                  {count > 0 ? ` · ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No tickets</Text>
            <Text style={styles.empty}>
              New customer chats and order support tickets appear here in real time.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.source === 'conversation') {
            const c = item.conversation;
            const unread = c.unreadAdmin > 0;
            const ticketNo = formatTicketNumber(c.referenceNumber, c.id);
            const avatar = c.userPhotoURL;
            return (
              <Pressable
                style={[styles.card, unread && styles.cardUnread]}
                onPress={() => {
                  router.push(adminRoutes.supportThread(c.id) as never);
                }}
              >
                <View style={styles.rowTop}>
                  {avatar ? (
                    <Image source={{ uri: avatar }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>
                        {(c.userName || 'C').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardMain}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {c.userName || 'Customer'}
                      </Text>
                      {unread ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>
                            {c.unreadAdmin > 9 ? '9+' : c.unreadAdmin}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.ticketLine}>
                      Ticket {ticketNo} · {formatSupportCategory(c.complaintCategory)}
                    </Text>
                    <Text style={styles.preview} numberOfLines={2}>
                      {c.lastMessage || 'No message yet'}
                    </Text>
                    <View style={styles.metaGrid}>
                      <MetaChip label="Status" value={friendlyStatus(c.status)} />
                      <MetaChip
                        label="Priority"
                        value={priorityLabel(c.priority)}
                      />
                      <MetaChip
                        label="Order"
                        value={c.orderId ? c.orderId.slice(0, 10) : '—'}
                      />
                      <MetaChip label="Restaurant" value="—" />
                      <MetaChip label="Driver" value="—" />
                      <MetaChip
                        label="Created"
                        value={formatCreatedShort(c.createdAtMs) || '—'}
                      />
                      <MetaChip
                        label="Photos"
                        value={String(c.attachmentUrls?.length ?? 0)}
                      />
                    </View>
                    <View style={styles.footerRow}>
                      <SupportStatusChip status={c.status} />
                      <Text
                        style={[
                          styles.priorityText,
                          { color: priorityTone(c.priority) },
                        ]}
                      >
                        {priorityLabel(c.priority)}
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
                  <Text style={styles.avatarInitial}>O</Text>
                </View>
                <View style={styles.cardMain}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {supportTicketTypeLabel(t.type)}
                    </Text>
                    {t.status === 'open' ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>1</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.ticketLine}>
                    Ticket {formatTicketNumber(null, t.id)} · Order support
                  </Text>
                  <Text style={styles.preview} numberOfLines={2}>
                    {t.message}
                  </Text>
                  <View style={styles.metaGrid}>
                    <MetaChip
                      label="Status"
                      value={supportTicketStatusLabel(t.status as SupportTicketStatus)}
                    />
                    <MetaChip label="Priority" value="Normal" />
                    <MetaChip
                      label="Order"
                      value={t.orderId ? t.orderId.slice(0, 10) : '—'}
                    />
                    <MetaChip label="Restaurant" value="—" />
                    <MetaChip label="Driver" value="—" />
                    <MetaChip
                      label="Created"
                      value={formatCreatedShort(t.createdAtMs) || '—'}
                    />
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
    borderRadius: 14,
    padding: 12,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    marginBottom: 10,
    fontFamily: adminFontFamily,
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
    backgroundColor: COLORS.primarySoft,
  },
  chipText: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  chipTextOn: { color: COLORS.primary },
  list: { padding: 16, paddingBottom: 32 },
  emptyWrap: { alignItems: 'center', marginTop: 48, gap: 8, paddingHorizontal: 24 },
  emptyTitle: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 18,
  },
  empty: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: { ...adminCardShell, marginBottom: 12 },
  cardUnread: {
    borderColor: 'rgba(168,85,247,0.5)',
    backgroundColor: 'rgba(168,85,247,0.08)',
  },
  rowTop: { flexDirection: 'row', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16 },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: adminFontFamily,
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 18,
  },
  cardMain: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: {
    flex: 1,
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontWeight: '800',
    fontSize: 16,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontFamily: adminFontFamily,
    color: '#FFF',
    fontWeight: '900',
    fontSize: 11,
  },
  ticketLine: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 4,
    fontSize: 12,
  },
  preview: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 20,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  metaChip: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: '30%',
    flexGrow: 1,
  },
  metaChipLabel: {
    fontFamily: adminFontFamily,
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaChipValue: {
    fontFamily: adminFontFamily,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 8,
  },
  priorityText: {
    fontFamily: adminFontFamily,
    fontWeight: '800',
    fontSize: 12,
  },
  archiveBtn: { alignSelf: 'flex-start', marginTop: 12 },
  archiveText: {
    fontFamily: adminFontFamily,
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },
});
