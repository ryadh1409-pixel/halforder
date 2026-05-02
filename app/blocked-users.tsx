import { BlockedUsersList } from '../components/BlockedUsersList';
import { useBlockedUsers } from '../hooks/useBlockedUsers';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getUserFriendlyError } from '../utils/errorHandler';
import { showError, showSuccess } from '../utils/toast';

const BG = '#000000';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const { uid, blockedUsers, blockedUserIds, loadingProfiles, unblockUser } =
    useBlockedUsers();
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const handleUnblock = async (targetUserId: string) => {
    if (!uid) return;
    setUnblockingId(targetUserId);
    try {
      await unblockUser(targetUserId);
      showSuccess('User unblocked');
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
          <Text style={styles.screenTitle}>Blocked Users</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.muted}>Sign in to manage blocked accounts.</Text>
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
        <Text style={styles.screenTitle}>Blocked Users</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.hint}>
          People you block cannot message you or appear in your matches and orders.
          Unblocking restores access instantly.
        </Text>
        <BlockedUsersList
          blockedUsers={blockedUsers}
          onUnblock={(id) => void handleUnblock(id)}
          unblockingId={unblockingId}
          loading={loadingProfiles && blockedUserIds.length > 0}
          emptyMessage="No blocked users"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backLink: { color: '#FF7A00', fontSize: 16, fontWeight: '600' },
  screenTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: 'rgba(255,255,255,0.55)', fontSize: 15, textAlign: 'center' },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  hint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
});
