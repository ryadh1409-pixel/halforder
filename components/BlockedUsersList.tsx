import type { BlockedUserRow } from '@/hooks/useBlockedUsers';
import { Image } from 'expo-image';
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

/** Matches Profile tab dark palette (Instagram-style settings). */
const D = {
  card: '#1C1C1E',
  text: '#FFFFFF',
  sub: 'rgba(255,255,255,0.55)',
  border: 'rgba(255,255,255,0.12)',
  avatarPh: '#2C2C2E',
  danger: '#F87171',
};

type Props = {
  blockedUsers: BlockedUserRow[];
  onUnblock: (userId: string) => void;
  unblockingId: string | null;
  /** When true, show a compact placeholder for the whole list (initial load). */
  loading?: boolean;
  emptyMessage?: string;
};

/**
 * Instagram-style rows: avatar | name | outlined Unblock.
 */
export function BlockedUsersList({
  blockedUsers,
  onUnblock,
  unblockingId,
  loading = false,
  emptyMessage = 'No blocked users',
}: Props) {
  if (loading && blockedUsers.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={D.danger} />
      </View>
    );
  }

  if (blockedUsers.length === 0) {
    return (
      <Text style={styles.emptyText}>{emptyMessage}</Text>
    );
  }

  return (
    <View style={styles.list}>
      {blockedUsers.map((u) => (
        <View key={u.userId} style={styles.card}>
          {u.avatarUrl ? (
            <Image
              source={{ uri: u.avatarUrl }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>
                {u.displayName.trim().charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.name} numberOfLines={1}>
              {u.displayName}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.unblockBtn}
            onPress={() => onUnblock(u.userId)}
            disabled={unblockingId === u.userId}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Unblock ${u.displayName}`}
          >
            {unblockingId === u.userId ? (
              <ActivityIndicator size="small" color={D.danger} />
            ) : (
              <Text style={styles.unblockLabel}>Unblock</Text>
            )}
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: D.sub,
    fontSize: 15,
    textAlign: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: D.card,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: D.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: D.avatarPh,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: D.text,
    fontSize: 20,
    fontWeight: '700',
  },
  meta: { flex: 1, marginLeft: 12, minWidth: 0 },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: D.text,
  },
  unblockBtn: {
    borderWidth: 1.5,
    borderColor: D.danger,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockLabel: {
    color: D.danger,
    fontWeight: '700',
    fontSize: 14,
  },
});
