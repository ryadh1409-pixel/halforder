import { AdminHeader } from '../../../components/admin/AdminHeader';
import { adminRoutes } from '../../../constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '../../../constants/adminTheme';
import { theme } from '../../../constants/theme';
import { formatFirestoreTime } from '../../../lib/admin/orderHelpers';
import { db } from '../../../services/firebase';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type FlaggedRow = {
  id: string;
  userId: string;
  matchId: string;
  category: string;
  preview: string;
  createdAt: string;
};

export default function AdminChatModerationScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<FlaggedRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'chatModerationEvents'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    const unsub = onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            userId: typeof data.userId === 'string' ? data.userId : '—',
            matchId: typeof data.matchId === 'string' ? data.matchId : '—',
            category: typeof data.category === 'string' ? data.category : '—',
            preview: typeof data.textPreview === 'string' ? data.textPreview : '',
            createdAt: formatFirestoreTime(data.createdAt),
          };
        }),
      );
      setReady(true);
    });
    return unsub;
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader title="Chat moderation" subtitle="Flagged messages · live" />
      {!ready ? (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.muted}>No flagged messages.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(adminRoutes.reports as never)}
            >
              <Text style={styles.time}>{item.createdAt}</Text>
              <Text style={styles.cat}>{item.category}</Text>
              <Text style={styles.line}>User: {item.userId}</Text>
              <Text style={styles.line}>Match: {item.matchId}</Text>
              {item.preview ? (
                <Text style={styles.preview} numberOfLines={2}>
                  {item.preview}
                </Text>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  card: { ...adminCardShell, marginBottom: 12, padding: theme.spacing.md },
  time: { fontSize: 12, color: COLORS.textMuted },
  cat: { fontSize: 16, fontWeight: '800', color: COLORS.error, marginVertical: 4 },
  line: { fontSize: 13, color: COLORS.textMuted },
  preview: { marginTop: 8, color: COLORS.text, fontSize: 14 },
  muted: { textAlign: 'center', color: COLORS.textMuted, marginTop: 24 },
});
