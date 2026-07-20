import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  archiveSupportThread,
  markSupportThreadReadByAdmin,
  subscribeAdminSupportThreads,
  type SupportThread,
} from '@/services/adminSupportInbox';
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

export default function AdminSupportInboxScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<SupportThread[]>([]);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);

  useEffect(() => {
    return subscribeAdminSupportThreads(setRows, { archived: showArchived });
  }, [showArchived]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterUnread && r.unreadAdmin <= 0) return false;
      if (!q) return true;
      return [r.userName, r.userEmail, r.userId, r.lastMessage, r.orderId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, filterUnread]);

  const unreadTotal = rows.reduce((s, r) => s + (r.unreadAdmin > 0 ? 1 : 0), 0);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Support Inbox"
        subtitle={
          unreadTotal > 0
            ? `${unreadTotal} unread conversation${unreadTotal === 1 ? '' : 's'}`
            : 'Customer messages to HalfOrder'
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
          <Pressable
            style={[styles.chip, !showArchived && styles.chipOn]}
            onPress={() => setShowArchived(false)}
          >
            <Text style={[styles.chipText, !showArchived && styles.chipTextOn]}>
              Open
            </Text>
          </Pressable>
          <Pressable
            style={[styles.chip, showArchived && styles.chipOn]}
            onPress={() => setShowArchived(true)}
          >
            <Text style={[styles.chipText, showArchived && styles.chipTextOn]}>
              Archived
            </Text>
          </Pressable>
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
          <Text style={styles.empty}>No support conversations yet.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, item.unreadAdmin > 0 && styles.cardUnread]}
            onPress={() => {
              void markSupportThreadReadByAdmin(item.id).catch(() => {});
              router.push(adminRoutes.supportThread(item.id) as never);
            }}
          >
            <View style={styles.rowTop}>
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
            <Text style={styles.meta}>
              {item.updatedAtMs
                ? new Date(item.updatedAtMs).toLocaleString()
                : '—'}
              {item.orderId ? ` · Order ${item.orderId}` : ''}
            </Text>
            {!item.archived ? (
              <Pressable
                style={styles.archiveBtn}
                onPress={() =>
                  void archiveSupportThread(item.id)
                    .then(() => showSuccess('Archived.'))
                    .catch((e) =>
                      showError(getReadableErrorMessageOr(e, 'Archive failed.')),
                    )
                }
              >
                <Text style={styles.archiveText}>Archive</Text>
              </Pressable>
            ) : null}
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
  empty: { color: COLORS.textMuted, textAlign: 'center', marginTop: 40 },
  card: { ...adminCardShell, marginBottom: 10 },
  cardUnread: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(168,85,247,0.10)',
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  archiveBtn: { alignSelf: 'flex-start', marginTop: 10 },
  archiveText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
});
