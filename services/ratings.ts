import { db } from '@/services/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

export async function saveRating(
  orderId: string,
  fromUserId: string,
  toUserId: string,
  rating: number,
  comment: string,
): Promise<void> {
  if (!orderId || !fromUserId || !toUserId) {
    throw new Error('Missing rating data.');
  }
  if (fromUserId === toUserId) {
    throw new Error('You cannot rate yourself.');
  }
  const alreadyRated = await hasRatedOrderForUser(orderId, fromUserId, toUserId);
  if (alreadyRated) {
    throw new Error('You already rated this participant.');
  }
  await addDoc(collection(db, 'ratings'), {
    orderId,
    fromUserId,
    toUserId,
    rating: Math.min(5, Math.max(1, Math.round(rating))),
    comment: comment.trim() || '',
    createdAt: serverTimestamp(),
  });
  // User doc (ratingAverage, ratingCount, averageRating, totalRatings) updated by Cloud Function onRatingCreated
}

export async function hasRatedOrder(
  orderId: string,
  fromUserId: string,
): Promise<boolean> {
  const q = query(
    collection(db, 'ratings'),
    where('orderId', '==', orderId),
    where('fromUserId', '==', fromUserId),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function hasRatedOrderForUser(
  orderId: string,
  fromUserId: string,
  toUserId: string,
): Promise<boolean> {
  const q = query(
    collection(db, 'ratings'),
    where('orderId', '==', orderId),
    where('fromUserId', '==', fromUserId),
    where('toUserId', '==', toUserId),
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

export async function getRatedUserIdsForOrder(
  orderId: string,
  fromUserId: string,
): Promise<Set<string>> {
  const q = query(
    collection(db, 'ratings'),
    where('orderId', '==', orderId),
    where('fromUserId', '==', fromUserId),
  );
  const snap = await getDocs(q);
  const ids = new Set<string>();
  snap.docs.forEach((d) => {
    const toUserId = d.data()?.toUserId;
    if (typeof toUserId === 'string' && toUserId) {
      ids.add(toUserId);
    }
  });
  return ids;
}

export type TrustScore = { average: number; count: number };

export type TrustTierLabel =
  | 'Trusted User 🔥'
  | 'New User'
  | 'Low Reliability ⚠️';

export type TrustScoreProfile = {
  average: number;
  count: number;
  totalOrdersCompleted: number;
  cancellationRate: number;
  reportCount: number;
  trustScore: number;
  label: TrustTierLabel;
};

function normalizeCancellationRate(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > 1 ? value / 100 : value;
}

export function calculateTrustScoreProfile(input: {
  averageRating: number;
  totalRatings: number;
  totalOrdersCompleted: number;
  cancellationRate: number;
  reportCount: number;
}): TrustScoreProfile {
  const average = Number.isFinite(input.averageRating) ? input.averageRating : 0;
  const count = Number.isFinite(input.totalRatings) ? input.totalRatings : 0;
  const totalOrdersCompleted = Number.isFinite(input.totalOrdersCompleted)
    ? input.totalOrdersCompleted
    : 0;
  const cancellationRate = normalizeCancellationRate(input.cancellationRate);
  const reportCount = Number.isFinite(input.reportCount) ? input.reportCount : 0;

  // Formula requested by product:
  // trustScore = (averageRating * 0.5) + (completedOrders * 0.3) - (cancellations * 0.1) - (reports * 0.1)
  const trustScoreRaw =
    average * 0.5 +
    totalOrdersCompleted * 0.3 -
    cancellationRate * 0.1 -
    reportCount * 0.1;
  const trustScore = Math.round(trustScoreRaw * 100) / 100;

  let label: TrustTierLabel = 'New User';
  if (totalOrdersCompleted === 0 && count === 0) {
    label = 'New User';
  } else if (trustScore >= 3) {
    label = 'Trusted User 🔥';
  } else if (trustScore < 2) {
    label = 'Low Reliability ⚠️';
  }

  return {
    average: Math.round(average * 10) / 10,
    count: Math.max(0, Math.round(count)),
    totalOrdersCompleted: Math.max(0, Math.round(totalOrdersCompleted)),
    cancellationRate,
    reportCount: Math.max(0, Math.round(reportCount)),
    trustScore,
    label,
  };
}

export async function getTrustScore(userId: string): Promise<TrustScore> {
  const profile = await getTrustScoreProfile(userId);
  return { average: profile.average, count: profile.count };
}

export async function getTrustScoreProfile(
  userId: string,
): Promise<TrustScoreProfile> {
  let averageRating = 0;
  let totalRatings = 0;
  let totalOrdersCompleted = 0;
  let cancellationRate = 0;
  let reportCount = 0;

  const userSnap = await getDoc(doc(db, 'users', userId));
  if (userSnap.exists()) {
    const d = userSnap.data();
    const avg = d?.ratingAverage ?? d?.averageRating;
    const cnt = d?.ratingCount ?? d?.totalRatings;
    averageRating = typeof avg === 'number' ? avg : 0;
    totalRatings = typeof cnt === 'number' ? cnt : 0;
    totalOrdersCompleted =
      typeof d?.totalOrdersCompleted === 'number'
        ? d.totalOrdersCompleted
        : typeof d?.ordersCount === 'number'
          ? d.ordersCount
          : 0;
    cancellationRate =
      typeof d?.cancellationRate === 'number'
        ? d.cancellationRate
        : typeof d?.cancelledOrders === 'number' &&
            totalOrdersCompleted + d.cancelledOrders > 0
          ? d.cancelledOrders / (totalOrdersCompleted + d.cancelledOrders)
          : 0;
    reportCount = typeof d?.reportCount === 'number' ? d.reportCount : 0;
  }

  if (totalRatings === 0) {
    const q = query(collection(db, 'ratings'), where('toUserId', '==', userId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      let sum = 0;
      snap.docs.forEach((d) => {
        const r = d.data().rating;
        if (typeof r === 'number') sum += r;
      });
      totalRatings = snap.size;
      averageRating = totalRatings > 0 ? sum / totalRatings : 0;
    }
  }

  if (reportCount === 0) {
    const reportsQ = query(
      collection(db, 'reports'),
      where('reportedUserId', '==', userId),
    );
    const reportsSnap = await getDocs(reportsQ);
    reportCount = reportsSnap.size;
  }

  if (cancellationRate === 0) {
    const cancelledQ = query(
      collection(db, 'orders'),
      where('createdBy', '==', userId),
      where('status', '==', 'cancelled'),
    );
    const cancelledSnap = await getDocs(cancelledQ);
    const cancelledOrders = cancelledSnap.size;
    const totalAttempts = totalOrdersCompleted + cancelledOrders;
    cancellationRate = totalAttempts > 0 ? cancelledOrders / totalAttempts : 0;
  }

  return calculateTrustScoreProfile({
    averageRating,
    totalRatings,
    totalOrdersCompleted,
    cancellationRate,
    reportCount,
  });
}
