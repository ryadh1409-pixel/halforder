import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import {
  setRestaurantAdminEnabled,
  subscribeAdminRestaurants,
  type AdminRestaurantRow,
} from '@/services/adminRestaurantManagement';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { formatRelativeTime } from '@/utils/time';
import { showError, showSuccess } from '@/utils/toast';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatLastActivity(ms: number | null): string {
  if (ms == null) return '—';
  return formatRelativeTime(ms);
}

export default function RestaurantManagementScreen() {
  const [rows, setRows] = useState<AdminRestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeAdminRestaurants((next) => {
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
        r.status.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const toggleEnabled = async (row: AdminRestaurantRow, enabled: boolean) => {
    setSavingId(row.id);
    try {
      await setRestaurantAdminEnabled(row.id, enabled);
      showSuccess(enabled ? 'Restaurant enabled.' : 'Restaurant disabled.');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Update failed.'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Restaurant Management"
        subtitle="Enable or disable venues across the platform"
      />
      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search restaurants…"
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
            <Text style={styles.empty}>No restaurants found.</Text>
          }
          renderItem={({ item }) => {
            const disabled = !item.adminEnabled;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  {item.logoUrl ? (
                    <Image
                      source={{ uri: item.logoUrl }}
                      style={styles.logo}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.logo, styles.logoPlaceholder]}>
                      <Text style={styles.logoLetter}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cardMain}>
                    <Text style={styles.name} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta}>ID: {item.id}</Text>
                    <View style={styles.badgeRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          disabled ? styles.statusDisabled : styles.statusActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            disabled ? styles.statusDisabledText : null,
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
                    <Text style={styles.statLabel}>Completed orders</Text>
                    <Text style={styles.statValue}>{item.completedOrders}</Text>
                  </View>
                  <View style={styles.statCell}>
                    <Text style={styles.statLabel}>Last activity</Text>
                    <Text style={styles.statValue}>
                      {formatLastActivity(item.lastActivityMs)}
                    </Text>
                  </View>
                </View>
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleLabel}>
                      {item.adminEnabled ? 'Enabled' : 'Disabled'}
                    </Text>
                    <Text style={styles.toggleHint}>
                      Disabled restaurants are hidden from customer browsing.
                    </Text>
                  </View>
                  <Switch
                    value={item.adminEnabled}
                    onValueChange={(v) => void toggleEnabled(item, v)}
                    disabled={savingId === item.id}
                    trackColor={{
                      false: '#3F3F46',
                      true: 'rgba(168, 85, 247, 0.45)',
                    }}
                    thumbColor={item.adminEnabled ? COLORS.primary : '#f4f3f4'}
                  />
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
  list: { padding: 16, paddingBottom: 32, gap: 12 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 32 },
  card: {
    ...adminCardShell,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: COLORS.border,
  },
  logoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
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
    marginTop: 4,
  },
  badgeRow: { flexDirection: 'row', marginTop: 8 },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusActive: {
    backgroundColor: COLORS.successBg,
  },
  statusDisabled: {
    backgroundColor: COLORS.dangerBg,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.successText,
  },
  statusDisabledText: {
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  toggleLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  toggleHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  saving: {
    marginTop: 8,
    color: COLORS.textMuted,
    fontSize: 12,
  },
});
