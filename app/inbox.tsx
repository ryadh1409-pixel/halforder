import { auth } from '@/services/firebase';
import { resolveFoodShareNotificationRoute } from '@/lib/foodShareNotificationRoutes';
import {
  markInboxNotificationRead,
  subscribeInboxNotifications,
  type InboxNotification,
} from '@/services/foodShareInbox';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

function formatTimestamp(ms: number | null): string {
  if (ms == null) return 'Just now';
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function NotificationRow({
  item,
  onPress,
}: {
  item: InboxNotification;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.row, !item.read && styles.rowUnread]}
      onPress={onPress}
    >
      <View style={styles.rowIcon}>
        <Ionicons
          name={item.read ? 'notifications-outline' : 'notifications'}
          size={20}
          color={item.read ? '#B7BDC9' : '#7DFFB8'}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowBodyText} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.rowTime}>{formatTimestamp(item.createdAtMs)}</Text>
      </View>
      {!item.read ? <View style={styles.unreadDot} /> : null}
    </Pressable>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? '';
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InboxNotification[]>([]);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return undefined;
    }
    return subscribeInboxNotifications(uid, (next) => {
      setRows(next);
      setLoading(false);
    });
  }, [uid]);

  const openNotification = async (item: InboxNotification) => {
    if (uid && !item.read) {
      try {
        await markInboxNotificationRead(uid, item.id);
      } catch {
        // Still navigate if mark-read fails.
      }
    }
    const href = resolveFoodShareNotificationRoute({
      type: item.type,
      deepLink: item.deepLink,
      matchId: item.matchId,
      adminFoodShareId: item.adminFoodShareId,
    });
    router.push(href as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <Pressable
          style={styles.settings}
          onPress={() => router.push('/notification-settings' as never)}
        >
          <Ionicons name="settings-outline" size={20} color="#FFF" />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#7DFFB8" />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={40} color="#7D8493" />
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyBody}>
            Match, chat, and order updates will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <NotificationRow item={item} onPress={() => void openNotification(item)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#09090B' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  title: { color: '#FFF', fontSize: 20, fontWeight: '900', flex: 1 },
  settings: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyTitle: { color: '#FFF', fontWeight: '800', fontSize: 18 },
  emptyBody: {
    color: '#B7BDC9',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
  list: { padding: 12, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  rowUnread: {
    backgroundColor: 'rgba(125,255,184,0.08)',
    borderColor: 'rgba(125,255,184,0.2)',
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  rowBodyText: {
    color: '#B7BDC9',
    marginTop: 4,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
  },
  rowTime: {
    color: '#7D8493',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7DFFB8',
    marginTop: 6,
  },
});
