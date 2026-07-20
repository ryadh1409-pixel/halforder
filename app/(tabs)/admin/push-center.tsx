import { AppTextInput } from '@/components/AppTextInput';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import type { AdminInboxTargetMode } from '@/services/adminInboxMessages';
import {
  PUSH_CATEGORIES,
  sendProfessionalPush,
  type PushNotificationCategory,
} from '@/services/adminPushCampaigns';
import {
  subscribeUsersForAdmin,
  type UserProfileDoc,
} from '@/services/userService';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TARGETS: { id: AdminInboxTargetMode; label: string }[] = [
  { id: 'one', label: 'Single user' },
  { id: 'multiple', label: 'Multiple' },
  { id: 'all', label: 'Broadcast' },
];

export default function AdminPushCenterScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('HalfOrder');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] =
    useState<PushNotificationCategory>('announcement');
  const [deepLink, setDeepLink] = useState('/inbox');
  const [targetMode, setTargetMode] = useState<AdminInboxTargetMode>('all');
  const [scheduleLater, setScheduleLater] = useState(false);
  const [users, setUsers] = useState<UserProfileDoc[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    return subscribeUsersForAdmin(setUsers, () => setUsers([]));
  }, []);

  useEffect(() => {
    const cat = PUSH_CATEGORIES.find((c) => c.id === category);
    if (cat) setDeepLink(cat.defaultDeepLink);
  }, [category]);

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

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

  const toggleUser = (id: string) => {
    setSelected((prev) =>
      targetMode === 'one' ? { [id]: !prev[id] } : { ...prev, [id]: !prev[id] },
    );
  };

  const send = async () => {
    if (!body.trim()) {
      showError('Enter a notification body.');
      return;
    }
    if (targetMode !== 'all' && selectedIds.length === 0) {
      showError('Select recipients.');
      return;
    }
    setSending(true);
    try {
      const result = await sendProfessionalPush({
        title,
        body,
        imageUrl: imageUrl.trim() || null,
        category,
        deepLink,
        targetMode,
        recipientUids: selectedIds,
        scheduleLaterMs: scheduleLater
          ? Date.now() + 60 * 60 * 1000
          : null,
      });
      showSuccess(
        scheduleLater
          ? 'Notification scheduled (1 hour).'
          : `Delivered ${result.delivered} · Failed ${result.failed}`,
      );
      setBody('');
      setSelected({});
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Send failed.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Push Center"
        subtitle="Production iOS notifications"
        fallbackRoute={adminRoutes.home}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {PUSH_CATEGORIES.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.chip, category === c.id && styles.chipOn]}
              onPress={() => setCategory(c.id)}
            >
              <Text
                style={[styles.chipText, category === c.id && styles.chipTextOn]}
              >
                {c.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Title</Text>
        <AppTextInput
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          placeholderTextColor={COLORS.textMuted}
        />
        <Text style={styles.label}>Body</Text>
        <AppTextInput
          value={body}
          onChangeText={setBody}
          style={[styles.input, styles.body]}
          multiline
          placeholder="Professional notification copy…"
          placeholderTextColor={COLORS.textMuted}
        />
        <Text style={styles.label}>Optional image URL</Text>
        <AppTextInput
          value={imageUrl}
          onChangeText={setImageUrl}
          style={styles.input}
          autoCapitalize="none"
          placeholder="https://…"
          placeholderTextColor={COLORS.textMuted}
        />
        <Text style={styles.label}>Deep link destination</Text>
        <AppTextInput
          value={deepLink}
          onChangeText={setDeepLink}
          style={styles.input}
          autoCapitalize="none"
          placeholderTextColor={COLORS.textMuted}
        />

        <Text style={styles.label}>Target</Text>
        <View style={styles.chipRow}>
          {TARGETS.map((t) => (
            <Pressable
              key={t.id}
              style={[styles.chip, targetMode === t.id && styles.chipOn]}
              onPress={() => {
                setTargetMode(t.id);
                setSelected({});
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  targetMode === t.id && styles.chipTextOn,
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {targetMode !== 'all' ? (
          <>
            <AppTextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search users…"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
            />
            <View style={styles.userList}>
              <FlatList
                data={filteredUsers}
                keyExtractor={(u) => u.id}
                scrollEnabled={false}
                renderItem={({ item }) => {
                  const on = !!selected[item.id];
                  return (
                    <Pressable
                      style={[styles.userRow, on && styles.userRowOn]}
                      onPress={() => toggleUser(item.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userName}>{item.name}</Text>
                        <Text style={styles.userEmail}>
                          {item.email ?? item.id}
                        </Text>
                      </View>
                      <Text style={styles.check}>{on ? '✓' : ''}</Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          </>
        ) : null}

        <Pressable
          style={[styles.chip, scheduleLater && styles.chipOn]}
          onPress={() => setScheduleLater((v) => !v)}
        >
          <Text style={[styles.chipText, scheduleLater && styles.chipTextOn]}>
            {scheduleLater ? 'Schedule later (1 hour)' : 'Send now'}
          </Text>
        </Pressable>

        <View style={styles.actions}>
          <Pressable style={styles.secondary} onPress={() => setPreviewOpen(true)}>
            <Text style={styles.secondaryText}>Preview</Text>
          </Pressable>
          <Pressable
            style={[styles.primary, sending && { opacity: 0.6 }]}
            onPress={() => void send()}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Send</Text>
            )}
          </Pressable>
        </View>

        <Pressable
          style={styles.linkBtn}
          onPress={() =>
            router.push(adminRoutes.notificationHistory as never)
          }
        >
          <Text style={styles.linkText}>Open Notification History →</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={previewOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.previewCard}>
            <Text style={styles.previewApp}>HalfOrder</Text>
            <Text style={styles.previewTitle}>{title || 'HalfOrder'}</Text>
            <Text style={styles.previewBody}>{body || 'Message body'}</Text>
            <Text style={styles.previewMeta}>
              now · tap opens {deepLink}
            </Text>
            <Pressable
              style={styles.primary}
              onPress={() => setPreviewOpen(false)}
            >
              <Text style={styles.primaryText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },
  label: {
    color: COLORS.textMuted,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 10,
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
  body: { minHeight: 100, textAlignVertical: 'top' },
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
  userList: {
    maxHeight: 240,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    marginBottom: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  userRowOn: { backgroundColor: 'rgba(168,85,247,0.12)' },
  userName: { color: COLORS.text, fontWeight: '700' },
  userEmail: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  check: { color: COLORS.primary, fontWeight: '900', width: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primary: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondary: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  secondaryText: { color: COLORS.text, fontWeight: '800' },
  linkBtn: { marginTop: 16, alignItems: 'center' },
  linkText: { color: COLORS.primary, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  previewCard: {
    ...adminCardShell,
    borderColor: COLORS.primary,
  },
  previewApp: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 8,
  },
  previewTitle: { color: COLORS.text, fontWeight: '800', fontSize: 17 },
  previewBody: {
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 20,
  },
  previewMeta: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 10,
    marginBottom: 16,
  },
});
