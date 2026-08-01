/**
 * Admin User Activity Screen
 * Shows recently active users, their last page, sign-in time,
 * and a per-user event log (page views, button clicks, sign-ins).
 */
import { adminColors as COLORS } from '@/constants/adminTheme';
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserSummary = {
  uid: string;
  displayName: string | null;
  email: string | null;
  lastPage: string | null;
  lastActiveAt: number | null;
  lastSignInAt: number | null;
  signInCount: number;
};

type ActivityEvent = {
  id: string;
  type: 'signin' | 'page_view' | 'button_click' | string;
  page?: string;
  buttonName?: string;
  platform: string;
  createdAtMs: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ms: number | null): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(ms).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function eventIcon(type: string): string {
  if (type === 'signin') return 'log-in-outline';
  if (type === 'page_view') return 'eye-outline';
  if (type === 'button_click') return 'hand-left-outline';
  return 'ellipse-outline';
}

function eventColor(type: string): string {
  if (type === 'signin') return '#22C55E';
  if (type === 'page_view') return '#3B82F6';
  if (type === 'button_click') return '#F59E0B';
  return '#6B7280';
}

function eventLabel(ev: ActivityEvent): string {
  if (ev.type === 'signin') return 'Signed in';
  if (ev.type === 'page_view') return `Visited: ${ev.page ?? '—'}`;
  if (ev.type === 'button_click') return `Tapped: ${ev.buttonName ?? '—'} (${ev.page ?? ''})`;
  return ev.type;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminUserActivityScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'userActivity'),
          orderBy('lastActiveAt', 'desc'),
          limit(100),
        ),
      );
      const rows: UserSummary[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          uid: d.id,
          displayName: (data.displayName as string) || null,
          email: (data.email as string) || null,
          lastPage: (data.lastPage as string) || null,
          lastActiveAt: safeToMillis(data.lastActiveAt),
          lastSignInAt: safeToMillis(data.lastSignInAt),
          signInCount: typeof data.signInCount === 'number' ? data.signInCount : 0,
        };
      });
      setUsers(rows);
    } catch (e) {
      console.warn('[AdminUserActivity] load error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const openUser = useCallback(async (user: UserSummary) => {
    setSelectedUser(user);
    setEventsLoading(true);
    setEvents([]);
    try {
      const snap = await getDocs(
        query(
          collection(db, 'userActivity', user.uid, 'events'),
          orderBy('createdAt', 'desc'),
          limit(50),
        ),
      );
      const rows: ActivityEvent[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          type: (data.type as string) || '',
          page: (data.page as string) || undefined,
          buttonName: (data.buttonName as string) || undefined,
          platform: (data.platform as string) || '',
          createdAtMs: safeToMillis(data.createdAt),
        };
      });
      setEvents(rows);
    } catch {
      // ignore
    } finally {
      setEventsLoading(false);
    }
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    void loadUsers();
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>User Activity</Text>
        <Pressable onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color={COLORS.primary} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading activity…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {/* Summary bar */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderColor: '#7C3AED40' }]}>
              <Text style={[styles.statValue, { color: '#7C3AED' }]}>{users.length}</Text>
              <Text style={styles.statLabel}>Tracked Users</Text>
            </View>
            <View style={[styles.statCard, { borderColor: '#22C55E40' }]}>
              <Text style={[styles.statValue, { color: '#22C55E' }]}>
                {users.filter((u) => u.lastActiveAt && Date.now() - u.lastActiveAt < 3_600_000).length}
              </Text>
              <Text style={styles.statLabel}>Active 1h</Text>
            </View>
            <View style={[styles.statCard, { borderColor: '#3B82F640' }]}>
              <Text style={[styles.statValue, { color: '#3B82F6' }]}>
                {users.filter((u) => u.lastActiveAt && Date.now() - u.lastActiveAt < 86_400_000).length}
              </Text>
              <Text style={styles.statLabel}>Active 24h</Text>
            </View>
          </View>

          {/* User list */}
          {users.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="pulse-outline" size={40} color="#374151" />
              <Text style={styles.emptyText}>No activity tracked yet.</Text>
              <Text style={styles.emptyHint}>
                Add usePageTracking('page_name') to screens you want to track.
              </Text>
            </View>
          ) : (
            users.map((u) => (
              <Pressable key={u.uid} style={styles.userCard} onPress={() => openUser(u)}>
                <View style={styles.userLeft}>
                  <Text style={styles.userName}>{u.displayName ?? 'Unknown User'}</Text>
                  {u.email ? <Text style={styles.userEmail}>{u.email}</Text> : null}
                  <View style={styles.pagePill}>
                    <Ionicons name="location-outline" size={11} color="#7C3AED" />
                    <Text style={styles.pageText}>{u.lastPage ?? 'No page recorded'}</Text>
                  </View>
                </View>
                <View style={styles.userRight}>
                  <Text style={styles.timeText}>{timeAgo(u.lastActiveAt)}</Text>
                  <View style={styles.signInBadge}>
                    <Ionicons name="log-in-outline" size={11} color="#22C55E" />
                    <Text style={styles.signInCount}>{u.signInCount}x</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#374151" />
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      {/* User event detail modal */}
      <Modal
        visible={!!selectedUser}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedUser(null)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setSelectedUser(null)} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <View style={styles.modalTitleBlock}>
              <Text style={styles.modalTitle}>
                {selectedUser?.displayName ?? 'User Activity'}
              </Text>
              {selectedUser?.email ? (
                <Text style={styles.modalEmail}>{selectedUser.email}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => {
                if (selectedUser) {
                  router.push(`/(tabs)/admin/user/${selectedUser.uid}` as never);
                  setSelectedUser(null);
                }
              }}
              style={styles.profileBtn}
            >
              <Text style={styles.profileBtnText}>Profile</Text>
            </Pressable>
          </View>

          {/* Meta */}
          {selectedUser && (
            <View style={styles.modalMeta}>
              <Text style={styles.metaItem}>
                Last active: {timeAgo(selectedUser.lastActiveAt)}
              </Text>
              <Text style={styles.metaItem}>
                Last sign-in: {timeAgo(selectedUser.lastSignInAt)}
              </Text>
              <Text style={styles.metaItem}>
                Last page: {selectedUser.lastPage ?? '—'}
              </Text>
            </View>
          )}

          {/* Events */}
          <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 40 }}>
            {eventsLoading ? (
              <View style={styles.center}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : events.length === 0 ? (
              <View style={styles.center}>
                <Text style={styles.emptyText}>No events recorded.</Text>
              </View>
            ) : (
              events.map((ev) => (
                <View key={ev.id} style={styles.eventRow}>
                  <View style={[styles.eventIcon, { backgroundColor: `${eventColor(ev.type)}20` }]}>
                    <Ionicons
                      name={eventIcon(ev.type) as never}
                      size={14}
                      color={eventColor(ev.type)}
                    />
                  </View>
                  <View style={styles.eventContent}>
                    <Text style={styles.eventLabel}>{eventLabel(ev)}</Text>
                    <Text style={styles.eventTime}>{timeAgo(ev.createdAtMs)}</Text>
                  </View>
                  {ev.platform ? (
                    <View style={styles.platformChip}>
                      <Text style={styles.platformText}>{ev.platform}</Text>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#09090F' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#0D0D1A',
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F2E',
  },
  backBtn: { marginRight: 12, padding: 2 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  refreshBtn: { padding: 4 },

  center: { paddingTop: 60, alignItems: 'center', gap: 12 },
  loadingText: { color: '#4B5563', fontSize: 14, fontWeight: '600' },

  scroll: { flex: 1 },

  statsRow: { flexDirection: 'row', gap: 10, padding: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#0D0D1A',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D1A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1F1F2E',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    gap: 12,
  },
  userLeft: { flex: 1, gap: 4 },
  userName: { fontSize: 15, fontWeight: '700', color: '#E2E8F0' },
  userEmail: { fontSize: 12, color: '#4B5563' },
  pagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  pageText: { fontSize: 12, color: '#7C3AED', fontWeight: '600' },
  userRight: { alignItems: 'flex-end', gap: 6 },
  timeText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  signInBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#14532D',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  signInCount: { fontSize: 11, color: '#22C55E', fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyText: { color: '#4B5563', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  emptyHint: { color: '#374151', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // Modal
  modal: { flex: 1, backgroundColor: '#09090F' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: '#0D0D1A',
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F2E',
    gap: 12,
  },
  closeBtn: { padding: 2 },
  modalTitleBlock: { flex: 1 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  modalEmail: { fontSize: 12, color: '#4B5563', marginTop: 1 },
  profileBtn: {
    backgroundColor: '#1A1A2E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${COLORS.primary}40`,
  },
  profileBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },

  modalMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
    backgroundColor: '#0D0D1A',
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F2E',
  },
  metaItem: { fontSize: 12, color: '#6B7280', fontWeight: '600' },

  modalScroll: { flex: 1 },

  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1F1F2E',
  },
  eventIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventContent: { flex: 1, gap: 2 },
  eventLabel: { fontSize: 13, fontWeight: '600', color: '#CBD5E1' },
  eventTime: { fontSize: 11, color: '#4B5563' },
  platformChip: {
    backgroundColor: '#1F1F2E',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  platformText: { fontSize: 10, color: '#6B7280', fontWeight: '600' },
});
