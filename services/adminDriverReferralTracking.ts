import { computeDriverReferralCode } from '@/services/driverReferralProgram';
import { db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export type AdminDriverReferralStats = {
  referralCode: string;
  totalSignups: number;
  successful: number;
  pending: number;
};

export type AdminDriverReferredUser = {
  id: string;
  name: string;
  email: string | null;
  registrationDateMs: number | null;
  accountStatus: string;
};

function attributionStatusLabel(status: string): string {
  switch (status) {
    case 'approved':
    case 'paid':
      return 'Successful';
    case 'cancelled':
      return 'Cancelled';
    case 'pending':
    default:
      return 'Pending';
  }
}

export function emptyAdminDriverReferralStats(
  referralCode = '',
): AdminDriverReferralStats {
  return {
    referralCode,
    totalSignups: 0,
    successful: 0,
    pending: 0,
  };
}

/**
 * Live referral counters keyed by driver uid (`driverReferralDriverStats`).
 */
export function subscribeAdminDriverReferralStats(
  onStats: (
    byDriverId: Record<
      string,
      Omit<AdminDriverReferralStats, 'referralCode'>
    >,
  ) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'driverReferralDriverStats'),
    (snap) => {
      const next: Record<
        string,
        Omit<AdminDriverReferralStats, 'referralCode'>
      > = {};
      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        next[d.id] = {
          totalSignups: Math.max(
            0,
            Math.floor(
              typeof data.totalReferrals === 'number' ? data.totalReferrals : 0,
            ),
          ),
          successful: Math.max(
            0,
            Math.floor(
              typeof data.successfulReferrals === 'number'
                ? data.successfulReferrals
                : 0,
            ),
          ),
          pending: Math.max(
            0,
            Math.floor(
              typeof data.pendingRewards === 'number'
                ? data.pendingRewards
                : 0,
            ),
          ),
        };
      });
      onStats(next);
    },
    () => onStats({}),
  );
}

export { computeDriverReferralCode };

/**
 * Referred customers for one driver, newest registration first.
 */
export function subscribeAdminDriverReferredUsers(
  driverId: string,
  onRows: (rows: AdminDriverReferredUser[]) => void,
): Unsubscribe {
  if (!driverId) {
    onRows([]);
    return () => undefined;
  }

  let cancelled = false;

  const unsub = onSnapshot(
    query(
      collection(db, 'driverReferralAttributions'),
      where('driverId', '==', driverId),
    ),
    (snap) => {
      void (async () => {
        const baseRows: AdminDriverReferredUser[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const status = String(data.status ?? 'pending').toLowerCase();
          return {
            id: d.id,
            name:
              (typeof data.customerName === 'string' && data.customerName) ||
              'Customer',
            email:
              typeof data.customerEmail === 'string'
                ? data.customerEmail
                : null,
            registrationDateMs:
              typeof data.authCreatedAtMs === 'number'
                ? data.authCreatedAtMs
                : typeof data.attributedAtMs === 'number'
                  ? data.attributedAtMs
                  : safeToMillis(data.attributedAt),
            accountStatus: attributionStatusLabel(status),
          };
        });

        const enriched = await Promise.all(
          baseRows.map(async (row) => {
            try {
              const userSnap = await getDoc(doc(db, 'users', row.id));
              if (!userSnap.exists()) return row;
              const data = userSnap.data() as Record<string, unknown>;
              const name =
                (typeof data.displayName === 'string' && data.displayName) ||
                (typeof data.name === 'string' && data.name) ||
                row.name;
              const email =
                typeof data.email === 'string' ? data.email : row.email;
              const accountStatus =
                data.restricted === true ? 'Restricted' : row.accountStatus;
              return { ...row, name, email, accountStatus };
            } catch {
              return row;
            }
          }),
        );

        if (cancelled) return;
        enriched.sort(
          (a, b) => (b.registrationDateMs ?? 0) - (a.registrationDateMs ?? 0),
        );
        onRows(enriched);
      })();
    },
    () => {
      if (!cancelled) onRows([]);
    },
  );

  return () => {
    cancelled = true;
    unsub();
  };
}
