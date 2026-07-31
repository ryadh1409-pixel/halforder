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

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
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
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in required');

  const existing = await getPendingApplicationForUser(uid, input.type);
  if (existing) return existing;

  const profile = await readApplicantProfile(uid);
  const restaurantName =
    pickString(input.restaurantName) ??
    (input.type === 'restaurant' ? profile.name : null);

  const payload: Record<string, unknown> = {
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
  };

  const ref = await addDoc(collection(db, PARTNER_APPLICATIONS_COLLECTION), payload);
  const snap = await getDoc(ref);
  return mapApplication(ref.id, (snap.data() ?? payload) as Record<string, unknown>);
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
