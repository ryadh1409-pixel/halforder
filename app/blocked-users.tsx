import { theme } from '@/constants/theme';
import { useBlock } from '@/hooks/useBlock';
import { useBlockedUserLabels } from '@/hooks/useBlockedUserLabels';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getUserFriendlyError } from '@/utils/errorHandler';
import { showError, showSuccess } from '@/utils/toast';

const tc = theme.colors;

export default function BlockedUsersScreen() {
  const router = useRouter();
  const { uid, blockedByMeIds, unblockUser } = useBlock();
  const labels = useBlockedUserLabels(blockedByMeIds);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const handleUnblock = async (targetUserId: string) => {
    if (!uid) return;
    setUnblockingId(targetUserId);
    try {
      await unblockUser(targetUserId);
      showSuccess('User unblocked.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setUnblockingId(null);
    }
  };

  if (!uid) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backLink}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Blocked users</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.muted}>Sign in to manage blocked users.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLink}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Blocked users</Text>
      </View>
      <Text style={styles.hint}>
        People you block cannot message you or appear in your matches and orders.
        Unblocking restores that instantly.
      </Text>
      <FlatList
        data={blockedByMeIds}
        keyExtractor={(id) => id}
        contentContainerStyle={
          blockedByMeIds.length === 0 ? styles.emptyList : styles.list
        }
        ListEmptyComponent={
          <Text style={styles.muted}>You have not blocked anyone.</Text>
        }
        renderItem={({ item: id }) => (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.name} numberOfLines={1}>
                {labels[id] ?? '…'}
              </Text>
              <Text style={styles.idHint} numberOfLines={1}>
                {id}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.unblockBtn}
              onPress={() => void handleUnblock(id)}
              disabled={unblockingId === id}
            >
              {unblockingId === id ? (
                <ActivityIndicator size="small" color={tc.textOnPrimary} />
              ) : (
                <Text style={styles.unblockText}>Unblock</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tc.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backLink: { color: tc.primary, fontSize: 16, fontWeight: '600' },
  screenTitle: { fontSize: 20, fontWeight: '800', color: tc.text, flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  hint: {
    color: tc.textMuted,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    lineHeight: 20,
  },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 0 },
  emptyList: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  muted: { color: tc.textMuted, fontSize: 15, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tc.border,
    gap: 12,
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { color: tc.text, fontSize: 16, fontWeight: '600' },
  idHint: { color: tc.textMuted, fontSize: 11, marginTop: 4 },
  unblockBtn: {
    backgroundColor: tc.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  unblockText: { color: tc.textOnPrimary, fontWeight: '700', fontSize: 15 },
});
