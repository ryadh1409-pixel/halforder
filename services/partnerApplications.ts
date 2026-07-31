/**
 * Driver / Restaurant partner applications — pending until Admin approves.
 */
import { PARTNER_APPLICATIONS_COLLECTION } from '@/types/partnerApplication';
import type {
  PartnerApplication,
  PartnerApplicationStatus,
  PartnerApplicationType,
} from '@/types/partnerApplication';
import { applySignupRole } from '@/services/authRoleAssignment';
import { sendAdminInboxMessages } from '@/services/adminInboxMessages';
import { auth, db } from '@/services/firebase';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

const LOG = '[partnerApplications]';

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Firestore rejects `undefined`; strip recursively. Keep null. */
function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => stripUndefinedDeep(v)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = stripUndefinedDeep(v);
  }
  return out as T;
}

function logFirebaseError(phase: string, error: unknown): void {
  const err = error as {
    code?: unknown;
    message?: unknown;
    stack?: unknown;
    name?: unknown;
  } | null;
  console.error(`${LOG} FAILED at ${phase}`, {
    code: err && typeof err === 'object' ? err.code : undefined,
    message: err && typeof err === 'object' ? err.message : String(error),
    name: err && typeof err === 'object' ? err.name : undefined,
    stack: err && typeof err === 'object' ? err.stack : undefined,
    fullError: error,
  });
}

export function formatPartnerApplicationError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error ?? 'Unknown error');
  }
  const e = error as { code?: unknown; message?: unknown };
  const code = typeof e.code === 'string' ? e.code : null;
  const message = typeof e.message === 'string' ? e.message : null;
  if (code && message) return `${code}: ${message}`;
  if (message) return message;
  if (code) return code;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function mapApplication(
  id: string,
  data: Record<string, unknown>,
): PartnerApplication {
  const type: PartnerApplicationType =
    data.type === 'restaurant' ? 'restaurant' : 'driver';
  const statusRaw = data.status;
  const status: PartnerApplicationStatus =
    statusRaw === 'approved' || statusRaw === 'rejected' ? statusRaw : 'pending';

  return {
    id,
    type,
    status,
    applicantUserId: pickString(data.applicantUserId) ?? '',
    applicantName: pickString(data.applicantName, data.name) ?? 'Applicant',
    email: pickString(data.email),
    phoneNumber: pickString(data.phoneNumber, data.phone),
    createdAtMs: safeToMillis(data.createdAt),
    updatedAtMs: safeToMillis(data.updatedAt),
    driverInfo:
      data.driverInfo && typeof data.driverInfo === 'object' && !Array.isArray(data.driverInfo)
        ? (data.driverInfo as Record<string, unknown>)
        : null,
    restaurantName: pickString(data.restaurantName),
    address: pickString(data.address),
    cuisine: pickString(data.cuisine),
    onboardingData:
      data.onboardingData &&
      typeof data.onboardingData === 'object' &&
      !Array.isArray(data.onboardingData)
        ? (data.onboardingData as Record<string, unknown>)
        : null,
    approvedBy: pickString(data.approvedBy),
    approvedAtMs: safeToMillis(data.approvedAt),
    rejectedBy: pickString(data.rejectedBy),
    rejectedAtMs: safeToMillis(data.rejectedAt),
    rejectionReason: pickString(data.rejectionReason),
    reviewedBy: pickString(data.reviewedBy),
    reviewedAtMs: safeToMillis(data.reviewedAt),
  };
}

async function readApplicantProfile(uid: string): Promise<{
  name: string;
  email: string | null;
  phone: string | null;
}> {
  console.log(`${LOG} readApplicantProfile`, { path: `users/${uid}` });
  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
  const authUser = auth.currentUser;
  return {
    name:
      pickString(data.displayName, data.name, authUser?.displayName) ?? 'Applicant',
    email: pickString(data.email, authUser?.email),
    phone: pickString(
      data.phoneNumber,
      data.phone,
      data.whatsapp,
      data.mobile,
      authUser?.phoneNumber,
    ),
  };
}

export type SubmitPartnerApplicationInput = {
  type: PartnerApplicationType;
  /** Optional restaurant fields collected during onboarding. */
  restaurantName?: string | null;
  address?: string | null;
  cuisine?: string | null;
  onboardingData?: Record<string, unknown> | null;
  driverInfo?: Record<string, unknown> | null;
};

/**
 * Creates a pending application. Does NOT assign driver/restaurant roles.
 * Reuses an existing pending application for the same user+type when present.
 */
export async function submitPartnerApplication(
  input: SubmitPartnerApplicationInput,
): Promise<PartnerApplication> {
  console.log(`${LOG} submitPartnerApplication() called`, { type: input.type });

  const uid = auth.currentUser?.uid ?? null;
  console.log(`${LOG} auth check`, {
    authenticated: Boolean(auth.currentUser),
    uid,
  });
  if (!uid) {
    throw new Error('Sign in required (no auth.currentUser.uid)');
  }

  console.log(`${LOG} validation passed`);

  try {
    console.log(`${LOG} checking existing pending application`, {
      collection: PARTNER_APPLICATIONS_COLLECTION,
      applicantUserId: uid,
      type: input.type,
    });
    const existing = await getPendingApplicationForUser(uid, input.type);
    if (existing) {
      console.log(`${LOG} reusing existing pending application`, {
        id: existing.id,
      });
      return existing;
    }
  } catch (error) {
    logFirebaseError('getPendingApplicationForUser', error);
    throw error;
  }

  let profile: { name: string; email: string | null; phone: string | null };
  try {
    profile = await readApplicantProfile(uid);
    console.log(`${LOG} applicant profile loaded`, profile);
  } catch (error) {
    logFirebaseError('readApplicantProfile', error);
    throw error;
  }

  const restaurantName =
    pickString(input.restaurantName) ??
    (input.type === 'restaurant' ? profile.name : null);

  const payload = stripUndefinedDeep({
    type: input.type,
    status: 'pending',
    applicantUserId: uid,
    applicantName: profile.name,
    email: profile.email,
    phoneNumber: profile.phone,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    driverInfo:
      input.type === 'driver'
        ? {
            name: profile.name,
            email: profile.email,
            phoneNumber: profile.phone,
            ...(input.driverInfo ?? {}),
          }
        : null,
    restaurantName: input.type === 'restaurant' ? restaurantName : null,
    address: input.type === 'restaurant' ? pickString(input.address) : null,
    cuisine: input.type === 'restaurant' ? pickString(input.cuisine) : null,
    onboardingData:
      input.type === 'restaurant' ? input.onboardingData ?? {} : null,
  });

  const firestorePath = PARTNER_APPLICATIONS_COLLECTION;
  console.log(`${LOG} application payload ready`, {
    firestorePath,
    type: payload.type,
    status: payload.status,
    applicantUserId: payload.applicantUserId,
    applicantName: payload.applicantName,
    email: payload.email,
    phoneNumber: payload.phoneNumber,
    hasDriverInfo: payload.driverInfo != null,
    keys: Object.keys(payload),
  });

  console.log(`${LOG} createPartnerApplication / addDoc called`, {
    path: firestorePath,
  });

  try {
    const ref = await addDoc(
      collection(db, PARTNER_APPLICATIONS_COLLECTION),
      payload,
    );
    console.log(`${LOG} Firestore write success`, {
      path: `${PARTNER_APPLICATIONS_COLLECTION}/${ref.id}`,
      id: ref.id,
    });
    const snap = await getDoc(ref);
    console.log(`${LOG} post-write getDoc`, { exists: snap.exists() });
    return mapApplication(
      ref.id,
      (snap.data() ?? payload) as Record<string, unknown>,
    );
  } catch (error) {
    logFirebaseError('addDoc(partnerApplications)', error);
    throw error;
  }
}

export async function getPendingApplicationForUser(
  uid: string,
  type: PartnerApplicationType,
): Promise<PartnerApplication | null> {
  const q = query(
    collection(db, PARTNER_APPLICATIONS_COLLECTION),
    where('applicantUserId', '==', uid),
    limit(25),
  );
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const row = mapApplication(d.id, d.data() as Record<string, unknown>);
    if (row.type === type && row.status === 'pending') return row;
  }
  return null;
}

export function subscribePendingPartnerApplications(
  onRows: (rows: PartnerApplication[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, PARTNER_APPLICATIONS_COLLECTION),
    where('status', '==', 'pending'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) =>
        mapApplication(d.id, d.data() as Record<string, unknown>),
      );
      rows.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
      onRows(rows);
    },
    () => onRows([]),
  );
}

export function subscribePartnerApplication(
  applicationId: string,
  onRow: (row: PartnerApplication | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, PARTNER_APPLICATIONS_COLLECTION, applicationId),
    (snap) => {
      if (!snap.exists()) {
        onRow(null);
        return;
      }
      onRow(mapApplication(snap.id, snap.data() as Record<string, unknown>));
    },
    () => onRow(null),
  );
}

export function subscribeUserPartnerApplications(
  uid: string,
  onRows: (rows: PartnerApplication[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, PARTNER_APPLICATIONS_COLLECTION),
    where('applicantUserId', '==', uid),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) =>
        mapApplication(d.id, d.data() as Record<string, unknown>),
      );
      rows.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
      onRows(rows);
    },
    () => onRows([]),
  );
}

async function notifyApplicant(
  uid: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    await sendAdminInboxMessages({
      title,
      body,
      kind: 'admin_account',
      targetMode: 'one',
      recipientUids: [uid],
      deepLink: '/inbox',
    });
  } catch (e) {
    console.warn('[partnerApplications] notify failed (non-fatal)', e);
  }
}

/** Admin-only: activate role + mark application approved + notify. */
export async function approvePartnerApplication(
  applicationId: string,
): Promise<void> {
  const adminUid = auth.currentUser?.uid;
  if (!adminUid) throw new Error('Sign in required');

  const ref = doc(db, PARTNER_APPLICATIONS_COLLECTION, applicationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Application not found');
  const app = mapApplication(snap.id, snap.data() as Record<string, unknown>);
  if (app.status !== 'pending') {
    throw new Error('Application is no longer pending');
  }
  if (!app.applicantUserId) throw new Error('Invalid applicant');

  const displayName =
    app.type === 'restaurant'
      ? app.restaurantName || app.applicantName
      : app.applicantName;

  await applySignupRole(app.applicantUserId, app.type, {
    displayName,
  });

  await updateDoc(ref, {
    status: 'approved',
    approvedBy: adminUid,
    approvedAt: serverTimestamp(),
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await notifyApplicant(
    app.applicantUserId,
    'Application approved',
    'Your application has been approved.',
  );
}

/** Admin-only: reject without deleting; notify applicant. */
export async function rejectPartnerApplication(
  applicationId: string,
  reason?: string | null,
): Promise<void> {
  const adminUid = auth.currentUser?.uid;
  if (!adminUid) throw new Error('Sign in required');

  const ref = doc(db, PARTNER_APPLICATIONS_COLLECTION, applicationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Application not found');
  const app = mapApplication(snap.id, snap.data() as Record<string, unknown>);
  if (app.status !== 'pending') {
    throw new Error('Application is no longer pending');
  }

  await updateDoc(ref, {
    status: 'rejected',
    rejectedBy: adminUid,
    rejectedAt: serverTimestamp(),
    rejectionReason: pickString(reason) ?? null,
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await notifyApplicant(
    app.applicantUserId,
    'Application update',
    'Your application was not approved.',
  );
}
