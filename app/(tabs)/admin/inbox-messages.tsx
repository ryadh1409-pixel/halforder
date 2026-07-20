import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminColors as COLORS } from '@/constants/adminTheme';
import { isAdminUser } from '@/constants/adminUid';
import {
  sendAdminInboxMessages,
  type AdminInboxMessageKind,
  type AdminInboxTargetMode,
} from '@/services/adminInboxMessages';
import { useAuth } from '@/services/AuthContext';
import {
  subscribeUsersForAdmin,
  type UserProfileDoc,
} from '@/services/userService';
import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const KINDS: { id: AdminInboxMessageKind; label: string }[] = [
  { id: 'admin_message', label: 'Message' },
  { id: 'admin_announcement', label: 'Announcement' },
  { id: 'admin_maintenance', label: 'Maintenance' },
  { id: 'admin_promotion', label: 'Promotion' },
  { id: 'admin_feature', label: 'Feature update' },
  { id: 'admin_alert', label: 'Alert' },
  { id: 'admin_account', label: 'Account notice' },
];

const TARGETS: { id: AdminInboxTargetMode; label: string }[] = [
  { id: 'one', label: 'One user' },
  { id: 'multiple', label: 'Multiple' },
  { id: 'all', label: 'Broadcast all' },
];

export default function AdminInboxMessagesScreen() {
  const { user, firestoreUserRole } = useAuth();
  const isAdmin = isAdminUser(user, firestoreUserRole);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<AdminInboxMessageKind>('admin_announcement');
  const [targetMode, setTargetMode] = useState<AdminInboxTargetMode>('one');
  const [users, setUsers] = useState<UserProfileDoc[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    if (!isAdmin) return undefined;
    return subscribeUsersForAdmin(
      (rows) => {
        setUsers(rows);
        setLoadingUsers(false);
      },
      () => setLoadingUsers(false),
    );
  }, [isAdmin]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    );
  }, [users, search]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const toggleUser = (id: string) => {
    setSelected((prev) => {
      if (targetMode === 'one') {
        return { [id]: !prev[id] };
      }
      return { ...prev, [id]: !prev[id] };
    });
  };

  const handleSend = async () => {
    if (!isAdmin) return;
    const message = body.trim();
    if (!message) {
      showError('Enter a message body.');
      return;
    }
    if (targetMode !== 'all' && selectedIds.length === 0) {
      showError('Select at least one recipient.');
      return;
    }
    if (targetMode === 'one' && selectedIds.length !== 1) {
      showError('Select exactly one recipient.');
      return;
    }

    setSending(true);
    try {
      const result = await sendAdminInboxMessages({
        title: title.trim() || 'HalfOrder',
        body: message,
        kind,
        targetMode,
        recipientUids: selectedIds,
      });
      showSuccess(
        `Sent to ${result.sent} inbox${result.sent === 1 ? '' : 'es'}` +
          (result.failed ? ` · ${result.failed} failed` : ''),
      );
      setBody('');
      setTitle('');
      setSelected({});
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSending(false);
    }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.muted}>Admin access required.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Inbox Messages"
        subtitle="Compose messages for user inboxes"
        fallbackRoute={adminRoutes.home}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Title</Text>
        <AppTextInput
          value={title}
          onChangeText={setTitle}
          placeholder="HalfOrder"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
        />

        <Text style={styles.label}>Message</Text>
        <AppTextInput
          value={body}
          onChangeText={setBody}
          placeholder="Write your announcement…"
          placeholderTextColor={COLORS.textMuted}
          style={[styles.input, styles.bodyInput]}
          multiline
        />

        <Text style={styles.label}>Type</Text>
        <View style={styles.chipRow}>
          {KINDS.map((k) => {
            const active = kind === k.id;
            return (
              <Pressable
                key={k.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setKind(k.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {k.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Recipients</Text>
        <View style={styles.chipRow}>
          {TARGETS.map((t) => {
            const active = targetMode === t.id;
            return (
              <Pressable
                key={t.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  setTargetMode(t.id);
                  setSelected({});
                }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {targetMode !== 'all' ? (
          <>
            <AppTextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, email, or uid"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
            {loadingUsers ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <View style={styles.userList}>
                <FlatList
                  data={filteredUsers}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  ListEmptyComponent={
                    <Text style={styles.muted}>No users found.</Text>
                  }
                  renderItem={({ item }) => {
                    const on = !!selected[item.id];
                    return (
                      <Pressable
                        style={[styles.userRow, on && styles.userRowOn]}
                        onPress={() => toggleUser(item.id)}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.userName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <Text style={styles.userEmail} numberOfLines={1}>
                            {item.email ?? item.id}
                          </Text>
                        </View>
                        <Text style={styles.check}>{on ? '✓' : ''}</Text>
                      </Pressable>
                    );
                  }}
                />
              </View>
            )}
            <Text style={styles.muted}>
              Selected: {selectedIds.length}
              {targetMode === 'one' ? ' (pick one)' : ''}
            </Text>
          </>
        ) : (
          <Text style={styles.muted}>
            Message will be written to every user inbox.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendDisabled]}
          onPress={() => void handleSend()}
          disabled={sending}
          activeOpacity={0.85}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendText}>Send to Inbox</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  scroll: { padding: 16, paddingBottom: 40 },
  label: {
    color: COLORS.textMuted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    color: COLORS.text,
    backgroundColor: COLORS.card,
    marginBottom: 8,
  },
  bodyInput: { minHeight: 110, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(168,85,247,0.18)',
  },
  chipText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: COLORS.text },
  userList: {
    maxHeight: 320,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  userRowOn: { backgroundColor: 'rgba(168,85,247,0.12)' },
  userName: { color: COLORS.text, fontWeight: '700' },
  userEmail: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  check: { color: COLORS.primary, fontWeight: '900', fontSize: 16, width: 20 },
  muted: { color: COLORS.textMuted, marginVertical: 8, fontWeight: '600' },
  sendBtn: {
    marginTop: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sendDisabled: { opacity: 0.6 },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
