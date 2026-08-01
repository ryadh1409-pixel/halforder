import { AdminHeader } from '../../../components/admin/AdminHeader';
import {
  subscribeUsersForAdmin,
  updateUserRole,
  type UserProfileDoc,
  type UserRole,
} from '../../../services/userService';
import { requireRole } from '../../../utils/requireRole';
import { showNotice } from '../../../utils/toast';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ROLE_OPTIONS: UserRole[] = ['user', 'driver', 'restaurant', 'admin'];

function editableRole(role: UserRole): UserRole {
  if (role === 'host') return 'restaurant';
  if (role === 'customer') return 'user';
  return role;
}

function roleLabel(role: UserRole): string {
  switch (role) {
    case 'user':
      return 'User';
    case 'driver':
      return 'Driver';
    case 'restaurant':
      return 'Restaurant';
    case 'admin':
      return 'Admin';
    case 'host':
      return 'Restaurant';
    case 'customer':
      return 'User';
    default:
      return role;
  }
}

function formatLastActive(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

export default function AdminUsersScreen() {
  const { authorized, loading: roleLoading } = requireRole(['admin']);
  const [users, setUsers] = useState<UserProfileDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>({});

  useEffect(() => {
    const unsub = subscribeUsersForAdmin(
      (rows) => {
        setUsers(rows);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, []);

  async function saveRole(uid: string) {
    const nextRole = draftRoles[uid];
    if (!nextRole) return;
    setSavingUserId(uid);
    try {
      await updateUserRole(uid, nextRole);
      showNotice('Role updated successfully', 'User role was updated successfully.');
    } finally {
      setSavingUserId(null);
    }
  }

  if (roleLoading || !authorized) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#A855F7" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader
        title="Customers & roles"
        subtitle="Change marketplace access in real time"
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#A855F7" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No users found.</Text>}
          renderItem={({ item }) => {
            const currentEditable = editableRole(item.role);
            const draft = draftRoles[item.id] ?? currentEditable;
            return (
              <View style={styles.card}>
                <View style={styles.topRow}>
                  {item.photoURL ? (
                    <Image
                      source={{ uri: item.photoURL }}
                      style={styles.avatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarLetter}>
                        {(item.name || 'U').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.identity}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.email} numberOfLines={1}>
                      {item.email ?? 'No email'}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      Phone: {item.phone ?? '—'}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      Last active: {formatLastActive(item.lastActiveMs)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.currentRole}>
                  Current role: {roleLabel(item.role)}
                </Text>
                <View style={styles.row}>
                  {ROLE_OPTIONS.map((option) => {
                    const active = draft === option;
                    return (
                      <Pressable
                        key={option}
                        style={[styles.roleChip, active ? styles.roleChipActive : null]}
                        onPress={() =>
                          setDraftRoles((prev) => ({ ...prev, [item.id]: option }))
                        }
                      >
                        <Text
                          style={[
                            styles.roleChipText,
                            active ? styles.roleChipTextActive : null,
                          ]}
                        >
                          {roleLabel(option)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  style={styles.saveButton}
                  onPress={() => saveRole(item.id)}
                  disabled={savingUserId === item.id}
                >
                  <Text style={styles.saveButtonText}>
                    {savingUserId === item.id ? 'Saving...' : 'Save role'}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#151126' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', color: '#7D8493', marginTop: 32, fontSize: 15 },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0B0816',
    marginBottom: 12,
    padding: 14,
  },
  topRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 16 },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(168,85,247,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#A855F7', fontWeight: '900', fontSize: 18 },
  identity: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  email: { fontSize: 14, color: '#7D8493', marginTop: 2 },
  meta: { fontSize: 12, color: '#B7BDC9', marginTop: 3, fontWeight: '600' },
  currentRole: { marginTop: 10, color: '#B7BDC9', fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 8 },
  roleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0B0816',
  },
  roleChipActive: { backgroundColor: '#DCFCE7', borderColor: '#22C55E' },
  roleChipText: { color: '#B7BDC9', fontWeight: '700' },
  roleChipTextActive: { color: '#166534' },
  saveButton: {
    marginTop: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: { color: '#FFFFFF', fontWeight: '800' },
});
