import {
    subscribeUsersForAdmin,
    updateUserRole,
    type UserProfileDoc,
    type UserRole,
} from '../../services/userService';
import { requireRole } from '../../utils/requireRole';
import { showNotice } from '../../utils/toast';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  const roleOptions: UserRole[] = ['user', 'driver', 'restaurant', 'admin'];

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
        <ActivityIndicator size="large" color="#16a34a" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Users & Roles</Text>
        <Text style={styles.subtitle}>Change marketplace access in real-time</Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No users found.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.email} numberOfLines={1}>
                {item.email ?? 'No email'}
              </Text>
              <Text style={styles.currentRole}>Current role: {item.role}</Text>
              <View style={styles.row}>
                {roleOptions.map((option) => {
                  const draft = draftRoles[item.id] ?? item.role;
                  const active = draft === option;
                  return (
                    <Pressable
                      key={option}
                      style={[styles.roleChip, active ? styles.roleChipActive : null]}
                      onPress={() =>
                        setDraftRoles((prev) => ({ ...prev, [item.id]: option }))
                      }
                    >
                      <Text style={[styles.roleChipText, active ? styles.roleChipTextActive : null]}>
                        {option}
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
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { color: '#0F172A', fontSize: 28, fontWeight: '800' },
  subtitle: { marginTop: 4, color: '#64748B', fontWeight: '600' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', color: '#64748B', marginTop: 32, fontSize: 15 },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    padding: 14,
  },
  name: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  email: { fontSize: 14, color: '#64748B', marginTop: 4 },
  currentRole: { marginTop: 8, color: '#334155', fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 8 },
  roleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  roleChipActive: { backgroundColor: '#DCFCE7', borderColor: '#16A34A' },
  roleChipText: { color: '#475569', fontWeight: '700', textTransform: 'capitalize' },
  roleChipTextActive: { color: '#166534' },
  saveButton: {
    marginTop: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: { color: '#FFFFFF', fontWeight: '800' },
});
