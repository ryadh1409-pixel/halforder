import { isAdminUser } from '@/constants/adminUid';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { theme } from '@/constants/theme';
import { useAuth } from '@/services/AuthContext';
import { db } from '@/services/firebase';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function formatTs(v: unknown): string {
  if (v && typeof v === 'object' && v !== null && 'toMillis' in v) {
    const fn = (v as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') return new Date(fn.call(v)).toLocaleString();
  }
  return '—';
}

export default function AdminOrderDetailScreen() {
  const router = useRouter();
  const { orderId: rawId } = useLocalSearchParams<{ orderId: string }>();
  const orderId = typeof rawId === 'string' ? rawId.trim() : '';
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    if (!orderId || !isAdminUser(user)) return;
    setError(null);
    try {
      const snap = await getDoc(doc(db, 'orders', orderId));
      setData(snap.exists() ? snap.data() ?? {} : {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load order');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, user]);

  useEffect(() => {
    if (!user) return;
    if (!isAdminUser(user)) {
      router.replace('/(tabs)');
      return;
    }
    if (!orderId) {
      setLoading(false);
      return;
    }
    void load();
  }, [user, orderId, load, router]);

  const setStatus = (next: string, title: string, message: string) => {
    if (!orderId) return;
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await updateDoc(doc(db, 'orders', orderId), {
              status: next,
              adminStatusUpdatedAt: serverTimestamp(),
            });
            await load();
            Alert.alert('Updated', `Order marked as ${next}.`);
          } catch (e) {
            Alert.alert(
              'Error',
              e instanceof Error ? e.message : 'Update failed',
            );
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (!user || !isAdminUser(user)) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.muted}>Access denied</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!orderId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.muted}>Invalid order id</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data || Object.keys(data).length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>← Orders</Text>
        </TouchableOpacity>
        <Text style={styles.muted}>{error ?? 'Order not found'}</Text>
      </SafeAreaView>
    );
  }

  const status = typeof data.status === 'string' ? data.status : '—';
  const foodName = typeof data.foodName === 'string' ? data.foodName : '—';
  const restaurant =
    typeof data.restaurantName === 'string' ? data.restaurantName : '—';
  const createdBy =
    (data.createdBy ?? data.hostId ?? data.creatorId ?? data.userId ?? '—') as
      | string
      | unknown;
  const creatorStr = typeof createdBy === 'string' ? createdBy : '—';
  const participants = Array.isArray(data.participants)
    ? data.participants.filter((x): x is string => typeof x === 'string')
    : [];
  const maxPeople =
    typeof data.maxPeople === 'number' ? data.maxPeople : undefined;
  const totalPrice =
    typeof data.totalPrice === 'number' ? data.totalPrice : null;

  const terminal = ['cancelled', 'completed', 'expired'].includes(status);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>← Orders</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Order detail</Text>
        <Text style={styles.mono}>{orderId}</Text>

        <View style={styles.card}>
          <Text style={styles.k}>Status</Text>
          <Text style={styles.v}>{status}</Text>
          <Text style={styles.k}>Food</Text>
          <Text style={styles.v}>{foodName}</Text>
          <Text style={styles.k}>Restaurant</Text>
          <Text style={styles.v}>{restaurant}</Text>
          <Text style={styles.k}>Creator id</Text>
          <TouchableOpacity
            onPress={() =>
              creatorStr !== '—'
                ? router.push(`/admin-user/${creatorStr}` as never)
                : undefined
            }
            disabled={creatorStr === '—'}
          >
            <Text style={[styles.v, creatorStr !== '—' && styles.linkLine]}>
              {creatorStr}
            </Text>
          </TouchableOpacity>
          <Text style={styles.k}>Created</Text>
          <Text style={styles.v}>{formatTs(data.createdAt)}</Text>
          {maxPeople != null ? (
            <>
              <Text style={styles.k}>Max people</Text>
              <Text style={styles.v}>{String(maxPeople)}</Text>
            </>
          ) : null}
          {totalPrice != null ? (
            <>
              <Text style={styles.k}>Total price</Text>
              <Text style={styles.v}>${totalPrice.toFixed(2)}</Text>
            </>
          ) : null}
          <Text style={styles.k}>Participants ({participants.length})</Text>
          {participants.map((pid) => (
            <TouchableOpacity
              key={pid}
              onPress={() => router.push(`/admin-user/${pid}` as never)}
            >
              <Text style={styles.participant}>{pid}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!terminal ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              disabled={saving}
              onPress={() =>
                setStatus(
                  'cancelled',
                  'Cancel order',
                  'Mark this order as cancelled?',
                )
              }
            >
              <Text style={styles.btnDangerText}>
                {saving ? '…' : 'Cancel order'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnOk]}
              disabled={saving}
              onPress={() =>
                setStatus(
                  'completed',
                  'Complete order',
                  'Mark this order as completed?',
                )
              }
            >
              <Text style={styles.btnOkText}>
                {saving ? '…' : 'Mark completed'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.muted}>No actions — terminal status.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: theme.spacing.md, paddingBottom: 40 },
  link: { fontSize: 16, color: COLORS.primary, fontWeight: '600' },
  linkLine: { textDecorationLine: 'underline' },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 12,
  },
  mono: { fontSize: 12, color: COLORS.textMuted, marginBottom: 12 },
  card: { ...adminCardShell, marginBottom: 16 },
  k: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  v: { fontSize: 15, color: COLORS.text, marginBottom: 10 },
  participant: {
    fontSize: 14,
    color: COLORS.primary,
    marginBottom: 6,
    fontWeight: '600',
  },
  muted: { fontSize: 14, color: COLORS.textMuted },
  actions: { gap: 12 },
  btn: {
    paddingVertical: 14,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
  },
  btnDanger: { backgroundColor: COLORS.dangerBg },
  btnDangerText: { color: COLORS.error, fontWeight: '700' },
  btnOk: { backgroundColor: COLORS.successBg },
  btnOkText: { color: COLORS.successText, fontWeight: '700' },
});
