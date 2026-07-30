import type { BlockedUserRow } from '../hooks/useBlockedUsers';
import { SETTINGS_LIST_COLORS } from './settings/SettingsList';
import { Image } from 'expo-image';
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

/** Matches the shared settings list palette. */
const D = {
  text: SETTINGS_LIST_COLORS.text,
  sub: SETTINGS_LIST_COLORS.subtitle,
  border: SETTINGS_LIST_COLORS.separator,
  avatarPh: '#1E2230',
  danger: SETTINGS_LIST_COLORS.danger,
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
      {blockedUsers.map((u, index) => (
        <View
          key={u.userId}
          style={[styles.row, index > 0 && styles.rowSeparator]}
        >
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
  list: {},
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: D.sub,
    fontSize: 15,
    paddingVertical: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 12,
  },
  rowSeparator: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: D.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: D.avatarPh,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: D.text,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: { flex: 1, marginLeft: 14, minWidth: 0 },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: D.text,
    letterSpacing: -0.2,
  },
  unblockBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  unblockLabel: {
    color: D.danger,
    fontWeight: '600',
    fontSize: 15,
  },
});
