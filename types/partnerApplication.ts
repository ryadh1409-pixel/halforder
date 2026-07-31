/** Partner (driver / restaurant) onboarding applications awaiting admin approval. */

export type PartnerApplicationType = 'driver' | 'restaurant';

export type PartnerApplicationStatus = 'pending' | 'approved' | 'rejected';

export type PartnerApplication = {
  id: string;
  type: PartnerApplicationType;
  status: PartnerApplicationStatus;
  applicantUserId: string;
  applicantName: string;
  email: string | null;
  phoneNumber: string | null;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  /** Driver-submitted snapshot (name/phone/email + extras). */
  driverInfo: Record<string, unknown> | null;
  restaurantName: string | null;
  address: string | null;
  cuisine: string | null;
  onboardingData: Record<string, unknown> | null;
  approvedBy: string | null;
  approvedAtMs: number | null;
  rejectedBy: string | null;
  rejectedAtMs: number | null;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAtMs: number | null;
};

export const PARTNER_APPLICATIONS_COLLECTION = 'partnerApplications' as const;
