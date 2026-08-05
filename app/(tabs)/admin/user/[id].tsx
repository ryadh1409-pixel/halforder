import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    updateDoc,
    where,
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AdminBankingInfoCard } from '../../../../components/admin/AdminBankingInfoCard';
import { AdminHeader } from '../../../../components/admin/AdminHeader';
import { adminRoutes } from '../../../../constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '../../../../constants/adminTheme';
import { theme } from '../../../../constants/theme';
import { adminError, adminLog } from '../../../../lib/admin/adminDebug';
import {
    formatFirestoreTime,
    isActiveOrderStatus,
    orderCreatorUid,
    orderParticipantUids,
    reportDetailText,
} from '../../../../lib/admin/orderHelpers';
import {
    deleteUserDocumentAsAdmin,
    demoteUserFromAdmin,
    promoteUserToAdmin,
} from '../../../../services/adminUserActions';
import {
    extractAdminDriverWalletInfo,
    extractAdminUserBankingInfo,
} from '../../../../services/adminUserBankingInfo';
import { useAuth } from '../../../../services/AuthContext';
import { db } from '../../../../services/firebase';

import { systemConfirm } from '../../../../components/SystemDialogHost';
import { getUserFriendlyError } from '../../../../utils/errorHandler';
import { showError, showSuccess } from '../../../../utils/toast';

type OrderRow = {
  id: string;
  title: string;
  status: string;
  role: string;
  createdAt: string;
};

type ReportRow = {
  id: string;
  reason: string | null;
  detail: string | null;
  createdAt: string;
  createdMs: number;
  adminResolution: string | null;
};

export default function AdminUserDetailScreen() {
  const router = useRouter();
  const { user: actor, firestoreUserRole } = useAuth();
  const { id: rawId, matchId: rawMatchId } = useLocalSearchParams<{ id: string; matchId?: string | string[] }>();
  const userId = typeof rawId === 'string' ? rawId.trim() : '';
  const matchId = useMemo(() => {
    const v = Array.isArray(rawMatchId) ? rawMatchId[0] : rawMatchId;
    return typeof v === 'string' ? v.trim() : '';
  }, [rawMatchId]);

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [driverDoc, setDriverDoc] = useState<Record<string, unknown> | null>(
    null,
  );
  const [profileLoading, setProfileLoading] = useState(true);
  const [ordersMap, setOrdersMap] = useState<Map<string, OrderRow>>(new Map());
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [acting, setActing] = useState(false);
  // Food Share match participant state (only used when matchId is provided)
  const [matchData, setMatchData] = useState<Record<string, unknown> | null>(null);
  const [hostProfile, setHostProfile] = useState<Record<string, unknown> | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<Record<string, unknown> | null>(null);
  const [partnerOrdersMap, setPartnerOrdersMap] = useState<Map<string, OrderRow>>(new Map());

  useEffect(() => {
    if (!userId) {
      setProfileLoading(false);
      return;
    }
    adminLog('user-detail', `subscribe user doc: ${userId}`);
    const u = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        adminLog('user-detail', 'user doc snapshot', {
          exists: snap.exists(),
          id: userId,
        });
        setProfile(snap.exists() ? snap.data() ?? {} : {});
        setProfileLoading(false);
      },
      (err) => {
        adminError('user-detail', 'user doc listener error', err);
        setProfileLoading(false);
      },
    );
    return () => u();
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setDriverDoc(null);
      return;
    }
    adminLog('user-detail', `subscribe driver doc: ${userId}`);
    const u = onSnapshot(
      doc(db, 'drivers', userId),
      (snap) => {
        setDriverDoc(snap.exists() ? snap.data() ?? {} : null);
      },
      (err) => {
        adminError('user-detail', 'driver doc listener error', err);
        setDriverDoc(null);
      },
    );
    return () => u();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    adminLog('user-detail', 'subscribe orders (filter client-side)', { userId });
    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        adminLog('user-detail', `orders snapshot for user: ${snap.size} total docs`);
        const next = new Map<string, OrderRow>();
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const uids = orderParticipantUids(data);
          if (!uids.includes(userId)) return;
          const creator = orderCreatorUid(data);
          const title =
            (typeof data.foodName === 'string' ? data.foodName : null) ??
            (typeof data.restaurantName === 'string' ? data.restaurantName : null) ??
            d.id.slice(0, 8);
          next.set(d.id, {
            id: d.id,
            title,
            status: typeof data.status === 'string' ? data.status : '—',
            role: creator === userId ? 'Restaurant' : 'Participant',
            createdAt: formatFirestoreTime(data.createdAt),
          });
        });
      adminLog('user-detail', `user linked orders: ${next.size}`);
      setOrdersMap(next);
    },
      (err) => adminError('user-detail', 'orders listener error', err),
    );
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    adminLog('user-detail', 'subscribe reports for reportedUserId', { userId });
    const q = query(
      collection(db, 'reports'),
      where('reportedUserId', '==', userId),
    );
    const u = onSnapshot(
      q,
      (snap) => {
        adminLog('user-detail', `reports vs user: ${snap.size}`);
        const list: ReportRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const c = data.createdAt;
          let createdMs = 0;
          if (c && typeof c === 'object' && c !== null && 'toMillis' in c) {
            const fn = (c as { toMillis: () => number }).toMillis;
            if (typeof fn === 'function') createdMs = fn.call(c);
          }
          return {
            id: d.id,
            reason: typeof data.reason === 'string' ? data.reason : null,
            detail: reportDetailText(data),
            createdAt: formatFirestoreTime(data.createdAt),
            createdMs,
            adminResolution:
              typeof data.adminResolution === 'string'
                ? data.adminResolution
                : null,
          };
        });
        list.sort((a, b) => b.createdMs - a.createdMs);
        setReports(list);
      },
      (err) => adminError('user-detail', 'reports listener error', err),
    );
    return () => u();
  }, [userId]);

  // Load match doc when matchId is present
  useEffect(() => {
    if (!matchId) return;
    getDoc(doc(db, 'matches', matchId))
      .then((snap) => setMatchData(snap.exists() ? (snap.data() ?? {}) : null))
      .catch(() => setMatchData(null));
  }, [matchId]);

  // Derive participant UIDs from match doc
  const hostUid: string = useMemo(() => {
    if (!matchData) return '';
    const a = (matchData as Record<string, unknown>).userA;
    return a != null && typeof (a as Record<string, unknown>).uid === 'string'
      ? (a as Record<string, unknown>).uid as string
      : '';
  }, [matchData]);
  const partnerUid: string = useMemo(() => {
    if (!matchData) return '';
    const b = (matchData as Record<string, unknown>).userB;
    return b != null && typeof (b as Record<string, unknown>).uid === 'string'
      ? (b as Record<string, unknown>).uid as string
      : '';
  }, [matchData]);

  // Load host and partner user docs
  useEffect(() => {
    if (!hostUid || !partnerUid) return;
    getDoc(doc(db, 'users', hostUid))
      .then((snap) => setHostProfile(snap.exists() ? (snap.data() ?? {}) : {}))
      .catch(() => setHostProfile({}));
    getDoc(doc(db, 'users', partnerUid))
      .then((snap) => setPartnerProfile(snap.exists() ? (snap.data() ?? {}) : {}))
      .catch(() => setPartnerProfile({}));
  }, [hostUid, partnerUid]);

  // Subscribe to orders for partner (only when matchId present)
  useEffect(() => {
    if (!partnerUid) return;
    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const next = new Map<string, OrderRow>();
        snap.docs.forEach((d) => {
          const data = d.data() as Record<string, unknown>;
          const uids = orderParticipantUids(data);
          if (!uids.includes(partnerUid)) return;
          const creator = orderCreatorUid(data);
          const title =
            (typeof data.foodName === 'string' ? data.foodName : null) ??
            (typeof data.restaurantName === 'string' ? data.restaurantName : null) ??
            d.id.slice(0, 8);
          next.set(d.id, {
            id: d.id,
            title,
            status: typeof data.status === 'string' ? data.status : '—',
            role: creator === partnerUid ? 'Restaurant' : 'Participant',
            createdAt: formatFirestoreTime(data.createdAt),
          });
        });
        setPartnerOrdersMap(next);
      },
      (err) => adminError('user-detail', 'partner orders listener error', err),
    );
    return () => unsub();
  }, [partnerUid]);

  const orderList = useMemo(() => [...ordersMap.values()], [ordersMap]);
  const stats = useMemo(() => {
    let active = 0;
    let completed = 0;
    orderList.forEach((o) => {
      if (o.status === 'completed') completed += 1;
      else if (isActiveOrderStatus(o.status)) active += 1;
    });
    return { active, completed, total: orderList.length };
  }, [orderList]);

  const partnerOrderList = useMemo(() => [...partnerOrdersMap.values()], [partnerOrdersMap]);
  const partnerStats = useMemo(() => {
    let active = 0;
    let completed = 0;
    partnerOrderList.forEach((o) => {
      if (o.status === 'completed') completed += 1;
      else if (isActiveOrderStatus(o.status)) active += 1;
    });
    return { active, completed, total: partnerOrderList.length };
  }, [partnerOrderList]);

  const matchPaymentStatus = (uid: string): string => {
    if (!matchData) return '—';
    const payments = (matchData as Record<string, unknown>).userPayments as Record<string, Record<string, unknown>> | null | undefined;
    return typeof payments?.[uid]?.paymentStatus === 'string' ? payments[uid].paymentStatus as string : '—';
  };

  const bankingInfo = useMemo(() => {
    const fromDriver = extractAdminDriverWalletInfo(driverDoc);
    if (fromDriver) return fromDriver;
    return extractAdminUserBankingInfo(profile);
  }, [driverDoc, profile]);

  const email = typeof profile?.email === 'string' ? profile.email : null;
  const targetRole =
    typeof profile?.role === 'string' ? profile.role.trim() : null;
  const isTargetAdmin = targetRole === 'admin';
  const displayName =
    typeof profile?.displayName === 'string' ? profile.displayName : '—';
  const banned = profile?.banned === true;
  const phone =
    typeof profile?.phoneNumber === 'string' ? profile.phoneNumber : null;

  const toggleBan = () => {
    if (!userId) return;
    void (async () => {
      const ok = await systemConfirm({
        title: banned ? 'Unban user' : 'Ban user',
        message: banned
          ? 'Restore access for this account?'
          : 'They will not be able to create or join orders.',
        confirmLabel: banned ? 'Unban' : 'Ban',
        destructive: !banned,
      });
      if (!ok) return;
      setActing(true);
      try {
        const nextBanned = !banned;
        adminLog('user-detail', 'updateDoc users.banned', {
          userId,
          banned: nextBanned,
        });
        await updateDoc(doc(db, 'users', userId), {
          banned: nextBanned ? true : false,
        });
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setActing(false);
      }
    })();
  };

  const promoteToAdmin = () => {
    if (!userId) return;
    void (async () => {
      const ok = await systemConfirm({
        title: 'Make admin',
        message:
          'Grant this user admin access in the app? They can open the admin panel after their Firestore role updates.',
        confirmLabel: 'Make admin',
        destructive: false,
      });
      if (!ok) return;
      setActing(true);
      try {
        await promoteUserToAdmin(actor, firestoreUserRole, userId);
        showSuccess('Customer promoted to admin.');
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setActing(false);
      }
    })();
  };

  const demoteFromAdmin = () => {
    if (!userId) return;
    void (async () => {
      const ok = await systemConfirm({
        title: 'Remove admin',
        message: 'Remove admin role from this user?',
        confirmLabel: 'Remove admin',
        destructive: true,
      });
      if (!ok) return;
      setActing(true);
      try {
        await demoteUserFromAdmin(actor, firestoreUserRole, userId);
        showSuccess('Admin access removed.');
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setActing(false);
      }
    })();
  };

  const deleteUser = () => {
    if (!userId) return;
    void (async () => {
      const ok = await systemConfirm({
        title: 'Delete user document',
        message:
          'Permanently delete this Firestore user profile? Auth account is not deleted.',
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      setActing(true);
      try {
        await deleteUserDocumentAsAdmin(actor, firestoreUserRole, userId);
        showSuccess('Customer document removed.');
        router.replace(adminRoutes.users as never);
      } catch (e) {
        showError(getUserFriendlyError(e));
      } finally {
        setActing(false);
      }
    })();
  };

  if (!userId) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.muted}>Invalid user id</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader title="Customer profile" fallbackRoute={adminRoutes.users} />
      {profileLoading && !profile ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {matchId && hostUid && partnerUid ? (
            <>
              <Text style={styles.section}>👤 Host</Text>
              <View style={styles.card}>
                <Text style={styles.k}>Display name</Text>
                <Text style={styles.v}>{typeof hostProfile?.displayName === 'string' ? hostProfile.displayName : '—'}</Text>
                <Text style={styles.k}>Email</Text>
                <Text style={styles.v}>{typeof hostProfile?.email === 'string' ? hostProfile.email : '—'}</Text>
                {typeof hostProfile?.phoneNumber === 'string' ? (
                  <>
                    <Text style={styles.k}>Phone</Text>
                    <Text style={styles.v}>{hostProfile.phoneNumber as string}</Text>
                  </>
                ) : null}
                <Text style={styles.k}>User ID</Text>
                <Text style={styles.mono}>{hostUid}</Text>
                <Text style={styles.k}>Member since</Text>
                <Text style={styles.v}>{formatFirestoreTime(hostProfile?.createdAt)}</Text>
                <Text style={styles.k}>Role</Text>
                <Text style={styles.v}>{typeof hostProfile?.role === 'string' ? hostProfile.role : '—'}</Text>
                <Text style={styles.k}>Payment status</Text>
                <Text style={styles.v}>{matchPaymentStatus(hostUid)}</Text>
              </View>
              <View style={styles.rowStats}>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{stats.total}</Text>
                  <Text style={styles.statL}>Total orders</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{stats.active}</Text>
                  <Text style={styles.statL}>Active</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{stats.completed}</Text>
                  <Text style={styles.statL}>Completed</Text>
                </View>
              </View>

              <Text style={styles.section}>👤 Partner</Text>
              <View style={styles.card}>
                <Text style={styles.k}>Display name</Text>
                <Text style={styles.v}>{typeof partnerProfile?.displayName === 'string' ? partnerProfile.displayName : '—'}</Text>
                <Text style={styles.k}>Email</Text>
                <Text style={styles.v}>{typeof partnerProfile?.email === 'string' ? partnerProfile.email : '—'}</Text>
                {typeof partnerProfile?.phoneNumber === 'string' ? (
                  <>
                    <Text style={styles.k}>Phone</Text>
                    <Text style={styles.v}>{partnerProfile.phoneNumber as string}</Text>
                  </>
                ) : null}
                <Text style={styles.k}>User ID</Text>
                <Text style={styles.mono}>{partnerUid}</Text>
                <Text style={styles.k}>Member since</Text>
                <Text style={styles.v}>{formatFirestoreTime(partnerProfile?.createdAt)}</Text>
                <Text style={styles.k}>Role</Text>
                <Text style={styles.v}>{typeof partnerProfile?.role === 'string' ? partnerProfile.role : '—'}</Text>
                <Text style={styles.k}>Payment status</Text>
                <Text style={styles.v}>{matchPaymentStatus(partnerUid)}</Text>
              </View>
              <View style={styles.rowStats}>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{partnerStats.total}</Text>
                  <Text style={styles.statL}>Total orders</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{partnerStats.active}</Text>
                  <Text style={styles.statL}>Active</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{partnerStats.completed}</Text>
                  <Text style={styles.statL}>Completed</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.k}>Display name</Text>
                <Text style={styles.v}>{displayName}</Text>
                <Text style={styles.k}>Email</Text>
                <Text style={styles.v}>{email ?? '—'}</Text>
                {phone ? (
                  <>
                    <Text style={styles.k}>Phone</Text>
                    <Text style={styles.v}>{phone}</Text>
                  </>
                ) : null}
                <Text style={styles.k}>Customer id</Text>
                <Text style={styles.mono}>{userId}</Text>
                <Text style={styles.k}>Member since</Text>
                <Text style={styles.v}>{formatFirestoreTime(profile?.createdAt)}</Text>
              </View>

              <View style={styles.rowStats}>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{stats.total}</Text>
                  <Text style={styles.statL}>Total orders</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{stats.active}</Text>
                  <Text style={styles.statL}>Active</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{stats.completed}</Text>
                  <Text style={styles.statL}>Completed</Text>
                </View>
              </View>
            </>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, banned ? styles.btnOk : styles.btnWarn]}
              onPress={toggleBan}
              disabled={acting}
            >
              <Text style={styles.btnText}>
                {banned ? 'Unban user' : 'Ban user'}
              </Text>
            </TouchableOpacity>
            {!isTargetAdmin ? (
              <TouchableOpacity
                style={[styles.btn, styles.btnOk]}
                onPress={promoteToAdmin}
                disabled={acting}
              >
                <Text style={styles.btnText}>Make admin</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.btn, styles.btnWarn]}
                onPress={demoteFromAdmin}
                disabled={acting}
              >
                <Text style={styles.btnText}>Remove admin</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnDanger]}
              onPress={deleteUser}
              disabled={acting}
            >
              <Text style={styles.btnDangerText}>Delete user doc</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>Bank &amp; Payout Information</Text>
          <AdminBankingInfoCard info={bankingInfo} />

          <Text style={styles.section}>Orders</Text>
          {orderList.length === 0 ? (
            <Text style={styles.muted}>No order activity found.</Text>
          ) : (
            orderList.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={styles.card}
                onPress={() => router.push(adminRoutes.order(o.id) as never)}
              >
                <Text style={styles.orderT}>{o.title}</Text>
                <Text style={styles.meta}>
                  {o.role} · {o.status}
                </Text>
                <Text style={styles.meta}>{o.createdAt}</Text>
                <Text style={styles.link}>Order details →</Text>
              </TouchableOpacity>
            ))
          )}

          <Text style={styles.section}>Reports against this user</Text>
          {reports.length === 0 ? (
            <Text style={styles.muted}>None</Text>
          ) : (
            reports.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={styles.card}
                onPress={() => router.push(adminRoutes.report(r.id) as never)}
              >
                <Text style={styles.meta}>{r.createdAt}</Text>
                <Text style={styles.v}>{r.reason ?? '—'}</Text>
                {r.detail ? (
                  <Text style={styles.preview} numberOfLines={3}>
                    {r.detail}
                  </Text>
                ) : null}
                {r.adminResolution ? (
                  <Text style={styles.res}>{r.adminResolution}</Text>
                ) : null}
                <Text style={styles.link}>Open report →</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { ...adminCardShell, marginBottom: 12, padding: theme.spacing.md },
  k: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  v: { fontSize: 16, color: COLORS.text, marginBottom: 10 },
  mono: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 10,
    fontFamily: 'Menlo',
  },
  rowStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  stat: {
    flex: 1,
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statN: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  statL: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  actions: { gap: 10, marginBottom: 8 },
  btn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnOk: { backgroundColor: COLORS.successBg },
  btnWarn: { backgroundColor: COLORS.dangerBg },
  btnDanger: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  btnText: { fontWeight: '800', color: COLORS.text },
  btnDangerText: { fontWeight: '800', color: COLORS.error },
  section: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 10,
  },
  orderT: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  link: { marginTop: 8, color: COLORS.primary, fontWeight: '700' },
  muted: { color: COLORS.textMuted, marginBottom: 8 },
  preview: { fontSize: 13, color: COLORS.textMuted, marginTop: 6 },
  res: { marginTop: 6, color: COLORS.successText, fontWeight: '600' },
});
