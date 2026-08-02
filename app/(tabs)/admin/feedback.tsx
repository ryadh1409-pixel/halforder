import { AdminHeader } from '../../../components/admin/AdminHeader';
import { useAuth } from '../../../services/AuthContext';
import { db } from '../../../services/firebase';
import { isAdminUser } from '../../../constants/adminUid';
import { adminColors as COLORS, adminCardShell } from '../../../constants/adminTheme';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

type FeedbackDoc = {
  id: string;
  orderId: string;
  orderType?: 'halforder' | 'fullorder';
  userId: string;
  restaurantName: string | null;
  orderRating: number;
  restaurantRating: number;
  driverRating: number | null;
  comment?: string;
  submittedAt: Timestamp | null;
};

function Stars({ value }: { value: number | null }) {
  if (value == null) return <Text style={s.na}>N/A</Text>;
  return (
    <Text style={s.stars}>
      {[1, 2, 3, 4, 5].map((n) => (n <= value ? '★' : '☆')).join('')}
      <Text style={s.starNum}> {value}/5</Text>
    </Text>
  );
}

function typeBadge(type?: string) {
  if (type === 'fullorder') return { label: 'FullOrder', bg: '#1D4ED8', fg: '#BFDBFE' };
  return { label: 'HalfOrder', bg: '#6D28D9', fg: '#DDD6FE' };
}

function avgLabel(items: number[]) {
  if (!items.length) return '—';
  const avg = items.reduce((a, b) => a + b, 0) / items.length;
  return avg.toFixed(1);
}

export default function AdminFeedbackScreen() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();
  const [docs, setDocs] = useState<FeedbackDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = isAdminUser(user, firestoreUserRole);

  useEffect(() => {
    if (!isAdmin) { setLoading(false); return; }
    const q = query(collection(db, 'orderFeedback'), orderBy('submittedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDocs(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedbackDoc, 'id'>) })),
        );
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
    return unsub;
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <AdminHeader title="User Feedback" />
        <View style={s.center}>
          <Text style={s.unauth}>Not authorized</Text>
        </View>
      </SafeAreaView>
    );
  }

  const orderRatings = docs.map((d) => d.orderRating).filter(Boolean);
  const restaurantRatings = docs.map((d) => d.restaurantRating).filter(Boolean);
  const driverRatings = docs.map((d) => d.driverRating).filter((r): r is number => r != null);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <AdminHeader title="User Feedback" />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>User Feedback</Text>

        {/* Summary row */}
        <View style={s.summaryRow}>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Total</Text>
            <Text style={s.summaryVal}>{docs.length}</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Avg Order</Text>
            <Text style={s.summaryVal}>{avgLabel(orderRatings)} ★</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Avg Rest.</Text>
            <Text style={s.summaryVal}>{avgLabel(restaurantRatings)} ★</Text>
          </View>
          <View style={s.summaryBox}>
            <Text style={s.summaryLabel}>Avg Driver</Text>
            <Text style={s.summaryVal}>{avgLabel(driverRatings)} ★</Text>
          </View>
        </View>

        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorTxt}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : docs.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={s.emptyEmoji}>💬</Text>
            <Text style={s.emptyTxt}>No feedback yet</Text>
            <Text style={s.emptyHint}>Ratings will appear here once users submit them.</Text>
          </View>
        ) : (
          docs.map((doc) => {
            const badge = typeBadge(doc.orderType);
            const submittedAt = doc.submittedAt
              ? new Date(doc.submittedAt.toMillis()).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })
              : null;
            return (
              <View key={doc.id} style={s.card}>
                {/* Header */}
                <View style={s.cardHeader}>
                  <View style={[s.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[s.badgeTxt, { color: badge.fg }]}>{badge.label}</Text>
                  </View>
                  {submittedAt ? (
                    <Text style={s.dateText}>{submittedAt}</Text>
                  ) : null}
                </View>

                {/* Restaurant */}
                <Text style={s.restaurantName}>{doc.restaurantName ?? 'Unknown restaurant'}</Text>

                {/* Ratings */}
                <View style={s.ratingsGrid}>
                  <View style={s.ratingRow}>
                    <Text style={s.ratingLabel}>🍽️ Order</Text>
                    <Stars value={doc.orderRating} />
                  </View>
                  <View style={s.ratingRow}>
                    <Text style={s.ratingLabel}>🏪 Restaurant</Text>
                    <Stars value={doc.restaurantRating} />
                  </View>
                  {doc.driverRating != null ? (
                    <View style={s.ratingRow}>
                      <Text style={s.ratingLabel}>🚗 Driver</Text>
                      <Stars value={doc.driverRating} />
                    </View>
                  ) : null}
                </View>

                {/* Comment */}
                {doc.comment ? (
                  <View style={s.commentBox}>
                    <Text style={s.commentText}>"{doc.comment}"</Text>
                  </View>
                ) : null}

                {/* Meta */}
                <View style={s.meta}>
                  <Text style={s.metaTxt} numberOfLines={1}>Order: {doc.orderId}</Text>
                  <Text style={s.metaTxt} numberOfLines={1}>User: {doc.userId}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 48 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorTxt: { color: COLORS.error, fontSize: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  unauth: { fontSize: 16, color: COLORS.error },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTxt: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  emptyHint: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  card: {
    ...adminCardShell,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
  dateText: { fontSize: 12, color: COLORS.textMuted },
  restaurantName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
  },
  ratingsGrid: { gap: 6, marginBottom: 10 },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ratingLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  stars: { fontSize: 14, fontWeight: '700', color: '#FBBF24' },
  starNum: { fontSize: 12, color: COLORS.textMuted },
  na: { fontSize: 12, color: COLORS.textMuted },
  commentBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    marginBottom: 10,
  },
  commentText: {
    fontSize: 14,
    color: COLORS.text,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  meta: { gap: 2, marginTop: 2 },
  metaTxt: { fontSize: 11, color: COLORS.textMuted, fontFamily: 'monospace' },
});
