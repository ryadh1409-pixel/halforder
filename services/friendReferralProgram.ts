import { REFERRAL_STORAGE_KEY } from '@/lib/invite-link';
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type FriendReferralStatus =
  | 'invited'
  | 'registered'
  | 'completed_first_order'
  | 'reward_issued';

export type FriendReferralRow = {
  id: string;
  friendUid: string | null;
  friendName: string | null;
  friendEmail: string | null;
  status: FriendReferralStatus;
  rewardAmount: number;
  createdAtMs: number | null;
  updatedAtMs: number | null;
};

export type ReferralProgramStats = {
  referralCode: string;
  inviteLink: string;
  totalInvited: number;
  pendingReferrals: number;
  successfulReferrals: number;
  totalRewardsEarned: number;
  currentRewardBalance: number;
  lifetimeRewards: number;
};

export type ReferralRewardRow = {
  id: string;
  label: string;
  amount: number;
  status: 'pending' | 'issued';
  createdAtMs: number | null;
};

const REFERRAL_REWARD_AMOUNT = 2;

function codeFromUid(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '');
  return (clean.slice(-8) || uid.slice(0, 8)).toUpperCase();
}

export function buildReferralInviteLink(code: string): string {
  return `https://halforder.app/invite/${encodeURIComponent(code.trim())}`;
}

export function buildReferralQrUrl(link: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;
}

export async function getOrCreateReferralCode(uid: string): Promise<string> {
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
  const existing =
    typeof data.referralCode === 'string' && data.referralCode.trim()
      ? data.referralCode.trim().toUpperCase()
      : null;
  const code = existing ?? codeFromUid(uid);
  if (!existing) {
    await setDoc(
      userRef,
      { referralCode: code, updatedAt: serverTimestamp() },
      { merge: true },
    );
    await setDoc(
      doc(db, 'referralCodes', code),
      { uid, createdAt: serverTimestamp() },
      { merge: true },
    );
  }
  return code;
}

export async function resolveReferralCodeToUid(code: string): Promise<string | null> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  const codeSnap = await getDoc(doc(db, 'referralCodes', trimmed));
  if (codeSnap.exists()) {
    const uid = (codeSnap.data() as Record<string, unknown>).uid;
    if (typeof uid === 'string' && uid.trim()) return uid.trim();
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('referralCode', '==', trimmed)),
    );
    return snap.docs[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function storeReferralInvite(code: string): Promise<string | null> {
  const uid = await resolveReferralCodeToUid(code);
  if (!uid) return null;
  await AsyncStorage.setItem(REFERRAL_STORAGE_KEY, uid);
  return uid;
}

function statusLabel(status: FriendReferralStatus): string {
  switch (status) {
    case 'registered':
      return 'Registered';
    case 'completed_first_order':
      return 'Completed first order';
    case 'reward_issued':
      return 'Reward issued';
    default:
      return 'Invited';
  }
}

export { statusLabel as friendReferralStatusLabel };

function inferStatus(data: Record<string, unknown>): FriendReferralStatus {
  const raw = String(data.status ?? '').toLowerCase();
  if (raw === 'reward_issued') return 'reward_issued';
  if (raw === 'completed_first_order') return 'completed_first_order';
  if (raw === 'registered') return 'registered';
  if (typeof data.orderId === 'string' && data.orderId.trim()) {
    return 'completed_first_order';
  }
  if (data.newUserId || data.invitedUserId || data.friendUid) return 'registered';
  return 'invited';
}

export function subscribeReferralProgram(
  uid: string,
  onUpdate: (
    stats: ReferralProgramStats,
    friends?: FriendReferralRow[],
    rewards?: ReferralRewardRow[],
  ) => void,
): Unsubscribe {
  let referralCode = codeFromUid(uid);
  let credits = 0;
  let friendReferralRows: FriendReferralRow[] = [];
  let legacyReferralRows: FriendReferralRow[] = [];

  const allFriends = () => {
    const byKey = new Map<string, FriendReferralRow>();
    for (const row of [...friendReferralRows, ...legacyReferralRows]) {
      const key = row.friendUid ?? row.id;
      byKey.set(key, row);
    }
    return Array.from(byKey.values()).sort(
      (a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0),
    );
  };

  const emit = () => {
    const friendRows = allFriends();
    const successful = friendRows.filter(
      (f) =>
        f.status === 'completed_first_order' || f.status === 'reward_issued',
    ).length;
    const pending = friendRows.filter(
      (f) => f.status === 'invited' || f.status === 'registered',
    ).length;
    const totalRewards = friendRows
      .filter((f) => f.status === 'reward_issued')
      .reduce((s, f) => s + f.rewardAmount, 0);

    const rewards: ReferralRewardRow[] = friendRows.map((f) => ({
      id: f.id,
      label: statusLabel(f.status),
      amount: f.rewardAmount,
      status: f.status === 'reward_issued' ? 'issued' : 'pending',
      createdAtMs: f.updatedAtMs ?? f.createdAtMs,
    }));

    onUpdate(
      {
        referralCode,
        inviteLink: buildReferralInviteLink(referralCode),
        totalInvited: friendRows.length,
        pendingReferrals: pending,
        successfulReferrals: successful,
        totalRewardsEarned: totalRewards,
        currentRewardBalance: credits,
        lifetimeRewards: totalRewards,
      },
      friendRows,
      rewards,
    );
  };

  void getOrCreateReferralCode(uid).then((code) => {
    referralCode = code;
    emit();
  });

  const unsubUser = onSnapshot(doc(db, 'users', uid), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    if (typeof data.referralCode === 'string' && data.referralCode.trim()) {
      referralCode = data.referralCode.trim().toUpperCase();
    }
    credits = typeof data.credits === 'number' ? data.credits : 0;
    emit();
  });

  const mergeFriendReferrals = (incoming: FriendReferralRow[]) => {
    friendReferralRows = incoming;
    emit();
  };

  const mergeLegacy = (incoming: FriendReferralRow[]) => {
    legacyReferralRows = incoming;
    emit();
  };

  const unsubFriends = onSnapshot(
    query(collection(db, 'friendReferrals'), where('referrerUid', '==', uid)),
    (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          friendUid: typeof data.friendUid === 'string' ? data.friendUid : null,
          friendName: typeof data.friendName === 'string' ? data.friendName : null,
          friendEmail: typeof data.friendEmail === 'string' ? data.friendEmail : null,
          status: inferStatus(data),
          rewardAmount:
            typeof data.rewardAmount === 'number'
              ? data.rewardAmount
              : REFERRAL_REWARD_AMOUNT,
          createdAtMs: safeToMillis(data.createdAt),
          updatedAtMs: safeToMillis(data.updatedAt),
        };
      });
      mergeFriendReferrals(rows);
    },
    () => mergeFriendReferrals([]),
  );

  const unsubLegacy = onSnapshot(
    query(collection(db, 'referrals'), where('referrerId', '==', uid)),
    (snap) => {
      const rows: FriendReferralRow[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const friendUid =
          (typeof data.newUserId === 'string' && data.newUserId) ||
          (typeof data.invitedUserId === 'string' && data.invitedUserId) ||
          null;
        return {
          id: `legacy-${d.id}`,
          friendUid,
          friendName: null,
          friendEmail: null,
          status: inferStatus(data),
          rewardAmount: REFERRAL_REWARD_AMOUNT,
          createdAtMs: safeToMillis(data.createdAt),
          updatedAtMs: safeToMillis(data.updatedAt) ?? safeToMillis(data.createdAt),
        };
      });
      mergeLegacy(rows);
    },
    () => mergeLegacy([]),
  );

  return () => {
    unsubUser();
    unsubFriends();
    unsubLegacy();
  };
}
