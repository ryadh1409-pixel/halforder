import { auth, db } from '@/services/firebase';
import {
  DRIVER_LAUNCH_CAMPAIGN_DEFAULTS,
  DRIVER_LAUNCH_CAMPAIGN_SETTINGS_DOC,
  DRIVER_LAUNCH_ENROLLMENTS_COLLECTION,
  buildDriverLaunchCampaignDashboard,
  type DriverLaunchCampaignDashboard,
  type DriverLaunchCampaignSettings,
  type DriverLaunchEnrollment,
  type DriverLaunchEnrollmentStatus,
} from '@/types/driverLaunchCampaign';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

const settingsRef = () =>
  doc(db, 'platformSettings', DRIVER_LAUNCH_CAMPAIGN_SETTINGS_DOC);

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function asNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

export function parseDriverLaunchCampaignSettings(
  data: Record<string, unknown> | undefined,
): DriverLaunchCampaignSettings {
  const d = DRIVER_LAUNCH_CAMPAIGN_DEFAULTS;
  return {
    enabled: data?.enabled === true,
    paused: data?.paused === true,
    bonusAmountCad: Math.max(
      0,
      asNumber(data?.bonusAmountCad, d.bonusAmountCad),
    ),
    requiredDeliveries: Math.max(
      1,
      Math.floor(asNumber(data?.requiredDeliveries, d.requiredDeliveries)),
    ),
    eligibleDriverLimit: Math.max(
      1,
      Math.floor(asNumber(data?.eligibleDriverLimit, d.eligibleDriverLimit)),
    ),
    startAtMs: asNullableNumber(data?.startAtMs),
    endAtMs: asNullableNumber(data?.endAtMs),
    newDriversOnly: data?.newDriversOnly === true,
    minDriverRating: asNullableNumber(data?.minDriverRating),
    maxCancellationRate: asNullableNumber(data?.maxCancellationRate),
    enrolledCount: Math.max(0, Math.floor(asNumber(data?.enrolledCount, 0))),
    driversCompleted: Math.max(
      0,
      Math.floor(asNumber(data?.driversCompleted, 0)),
    ),
    bonusesPaid: Math.max(0, Math.floor(asNumber(data?.bonusesPaid, 0))),
    totalBudgetPaidCad: Math.max(
      0,
      asNumber(data?.totalBudgetPaidCad, 0),
    ),
    progressSum: Math.max(0, asNumber(data?.progressSum, 0)),
    updatedAtMs: asNumber(data?.updatedAtMs, 0),
    updatedBy:
      typeof data?.updatedBy === 'string' ? data.updatedBy : null,
  };
}

function parseEnrollment(
  id: string,
  raw: Record<string, unknown>,
): DriverLaunchEnrollment {
  const statusRaw = raw.status;
  const status: DriverLaunchEnrollmentStatus =
    statusRaw === 'bonus_unlocked' ||
    statusRaw === 'bonus_paid' ||
    statusRaw === 'expired'
      ? statusRaw
      : 'active';
  return {
    id,
    driverId: typeof raw.driverId === 'string' ? raw.driverId : id,
    driverName:
      typeof raw.driverName === 'string' && raw.driverName.trim()
        ? raw.driverName.trim()
        : 'Driver',
    status,
    slotIndex: Math.max(0, Math.floor(asNumber(raw.slotIndex, 0))),
    bonusAmountCad: Math.max(0, asNumber(raw.bonusAmountCad, 0)),
    requiredDeliveries: Math.max(
      1,
      Math.floor(asNumber(raw.requiredDeliveries, 1)),
    ),
    completedDeliveries: Math.max(
      0,
      Math.floor(asNumber(raw.completedDeliveries, 0)),
    ),
    enrolledAtMs: asNumber(raw.enrolledAtMs, 0),
    bonusUnlockedAtMs: asNullableNumber(raw.bonusUnlockedAtMs),
    bonusPaidAtMs: asNullableNumber(raw.bonusPaidAtMs),
    lastOrderId:
      typeof raw.lastOrderId === 'string' ? raw.lastOrderId : null,
  };
}

export function subscribeDriverLaunchCampaignSettings(
  onData: (settings: DriverLaunchCampaignSettings) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    settingsRef(),
    (snap) => {
      onData(
        parseDriverLaunchCampaignSettings(
          snap.data() as Record<string, unknown> | undefined,
        ),
      );
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load campaign'));
      onData(parseDriverLaunchCampaignSettings(undefined));
    },
  );
}

export function subscribeDriverLaunchCampaignDashboard(
  onData: (dash: DriverLaunchCampaignDashboard) => void,
): Unsubscribe {
  return subscribeDriverLaunchCampaignSettings((settings) => {
    onData(buildDriverLaunchCampaignDashboard(settings));
  });
}

export async function saveDriverLaunchCampaignSettings(input: {
  enabled: boolean;
  paused: boolean;
  bonusAmountCad: number;
  requiredDeliveries: number;
  eligibleDriverLimit: number;
  startAtMs: number | null;
  endAtMs: number | null;
  newDriversOnly: boolean;
  minDriverRating: number | null;
  maxCancellationRate: number | null;
}): Promise<void> {
  const uid = auth.currentUser?.uid ?? '';
  if (!uid) throw new Error('Sign in required');

  const eligibleDriverLimit = Math.max(
    1,
    Math.floor(input.eligibleDriverLimit),
  );
  const requiredDeliveries = Math.max(1, Math.floor(input.requiredDeliveries));
  const bonusAmountCad = Math.max(0, Number(input.bonusAmountCad));

  const existing = await getDoc(settingsRef());
  const prev = parseDriverLaunchCampaignSettings(
    existing.data() as Record<string, unknown> | undefined,
  );

  if (eligibleDriverLimit < prev.enrolledCount) {
    throw new Error(
      `Eligible driver limit cannot be below current enrollments (${prev.enrolledCount}).`,
    );
  }

  await setDoc(
    settingsRef(),
    {
      enabled: input.enabled === true,
      paused: input.paused === true,
      bonusAmountCad,
      requiredDeliveries,
      eligibleDriverLimit,
      startAtMs: input.startAtMs,
      endAtMs: input.endAtMs,
      newDriversOnly: input.newDriversOnly === true,
      minDriverRating: input.minDriverRating,
      maxCancellationRate: input.maxCancellationRate,
      // Preserve atomic counters — never reset from client admin save.
      enrolledCount: prev.enrolledCount,
      driversCompleted: prev.driversCompleted,
      bonusesPaid: prev.bonusesPaid,
      totalBudgetPaidCad: prev.totalBudgetPaidCad,
      progressSum: prev.progressSum,
      updatedAtMs: Date.now(),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function subscribeDriverLaunchEnrollments(
  onData: (rows: DriverLaunchEnrollment[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, DRIVER_LAUNCH_ENROLLMENTS_COLLECTION),
    (snap) => {
      const rows = snap.docs.map((d) =>
        parseEnrollment(d.id, d.data() as Record<string, unknown>),
      );
      rows.sort((a, b) => a.slotIndex - b.slotIndex);
      onData(rows);
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load enrollments'));
      onData([]);
    },
  );
}

export function subscribeMyDriverLaunchEnrollment(
  driverId: string,
  onData: (row: DriverLaunchEnrollment | null) => void,
): Unsubscribe {
  const id = driverId.trim();
  if (!id) {
    onData(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, DRIVER_LAUNCH_ENROLLMENTS_COLLECTION, id),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(parseEnrollment(snap.id, snap.data() as Record<string, unknown>));
    },
    () => onData(null),
  );
}

export async function enrollInDriverLaunchCampaign(): Promise<{
  ok: boolean;
  alreadyEnrolled?: boolean;
  slotIndex?: number;
  message: string;
}> {
  const fn = httpsCallable(functions, 'enrollDriverLaunchCampaign');
  const res = await fn({});
  return res.data as {
    ok: boolean;
    alreadyEnrolled?: boolean;
    slotIndex?: number;
    message: string;
  };
}

export async function markDriverLaunchBonusPaid(
  driverId: string,
): Promise<void> {
  const fn = httpsCallable(functions, 'markDriverLaunchBonusPaid');
  await fn({ driverId });
}
