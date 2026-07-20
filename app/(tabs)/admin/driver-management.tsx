import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  setDriverAdminSuspended,
  subscribeAdminDrivers,
  type AdminDriverRow,
} from '@/services/adminDriverManagement';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverManagementScreen() {
  const [rows, setRows] = useState<AdminDriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeAdminDrivers((next) => {
      setRows(next);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.email ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const toggleSuspended = async (row: AdminDriverRow, suspend: boolean) => {
    setSavingId(row.id);
    try {
      await setDriverAdminSuspended(row.id, suspend);
      showSuccess(suspend ? 'Driver suspended.' : 'Driver reactivated.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Update failed.'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Driver Management"
        subtitle="Suspend or reactivate delivery partners"
      />
      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search drivers…"
          placeholderTextColor={COLORS.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No drivers found.</Text>
          }
          renderItem={({ item }) => {
            const suspended = item.adminSuspended;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  {item.photoUrl ? (
                    <Image
                      source={{ uri: item.photoUrl }}
                      style={styles.avatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Text style={styles.avatarLetter}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardMain}>
                    <Text style={styles.name} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {item.email ?? 'No email'}
                    </Text>
                    <Text style={styles.meta}>ID: {item.id}</Text>
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          suspended ? styles.statusSuspended : styles.statusOnline,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            suspended ? styles.statusSuspendedText : null,
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <View style={styles.statsRow}>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Deliveries</Text>
                    <Text style={styles.statValue}>
                      {item.deliveriesCompleted}
                    </Text>
                  </View>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Rating</Text>
                    <Text style={styles.statValue}>
                      {item.rating != null ? item.rating.toFixed(1) : '—'}
                    </Text>
                  </View>
                </View>
                <View style={styles.actionsRow}>
                  {suspended ? (
                    <Pressable
                      style={[styles.actionBtn, styles.reactivateBtn]}
                      onPress={() => void toggleSuspended(item, false)}
                      disabled={savingId === item.id}
                    >
                      <Text style={styles.reactivateText}>Reactivate Driver</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.actionBtn, styles.suspendBtn]}
                      onPress={() => void toggleSuspended(item, true)}
                      disabled={savingId === item.id}
                    >
                      <Text style={styles.suspendText}>Suspend Driver</Text>
                    </Pressable>
                  )}
                </View>
                {savingId === item.id ? (
                  <Text style={styles.saving}>Saving…</Text>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  list: { padding: 16, paddingBottom: 32 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 32 },
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.border,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '800',
  },
  cardMain: { flex: 1, minWidth: 0 },
  name: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: '800',
  },
  meta: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  badgeRow: { flexDirection: 'row', marginTop: 8 },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusOnline: {
    backgroundColor: COLORS.successBg,
  },
  statusSuspended: {
    backgroundColor: COLORS.dangerBg,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.successText,
  },
  statusSuspendedText: {
    color: COLORS.error,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  statCell: { flex: 1 },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statValue: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  actionsRow: { marginTop: 14 },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  suspendBtn: {
    backgroundColor: COLORS.dangerBg,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  suspendText: {
    color: COLORS.error,
    fontWeight: '800',
    fontSize: 15,
  },
  reactivateBtn: {
    backgroundColor: COLORS.successBg,
    borderWidth: 1,
    borderColor: COLORS.successText,
  },
  reactivateText: {
    color: COLORS.successText,
    fontWeight: '800',
    fontSize: 15,
  },
  saving: {
    marginTop: 8,
    color: COLORS.textMuted,
    fontSize: 12,
  },
});
