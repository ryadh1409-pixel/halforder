/** Limited Driver Launch Campaign — config lives in platformSettings (not hardcoded). */

export const DRIVER_LAUNCH_CAMPAIGN_SETTINGS_DOC = 'driverLaunchCampaign';
export const DRIVER_LAUNCH_ENROLLMENTS_COLLECTION = 'driverLaunchEnrollments';
export const DRIVER_LAUNCH_PROGRESS_COLLECTION = 'driverLaunchProgress';

/** Defaults loaded into Admin config when the settings doc is missing. */
export const DRIVER_LAUNCH_CAMPAIGN_DEFAULTS = {
  enabled: false,
  paused: false,
  bonusAmountCad: 75,
  requiredDeliveries: 5,
  eligibleDriverLimit: 50,
  startAtMs: null as number | null,
  endAtMs: null as number | null,
  newDriversOnly: false,
  minDriverRating: null as number | null,
  maxCancellationRate: null as number | null,
} as const;

export type DriverLaunchEnrollmentStatus =
  | 'active'
  | 'bonus_unlocked'
  | 'bonus_paid'
  | 'expired';

export type DriverLaunchCampaignSettings = {
  enabled: boolean;
  paused: boolean;
  bonusAmountCad: number;
  requiredDeliveries: number;
  eligibleDriverLimit: number;
  startAtMs: number | null;
  endAtMs: number | null;
  newDriversOnly: boolean;
  /** Null = no minimum. */
  minDriverRating: number | null;
  /** Fraction 0–1, or null = no max. */
  maxCancellationRate: number | null;
  /** Atomic reserved seats (never decreases). */
  enrolledCount: number;
  driversCompleted: number;
  bonusesPaid: number;
  totalBudgetPaidCad: number;
  /** Sum of progress ratios for enrolled drivers (for average). */
  progressSum: number;
  updatedAtMs: number;
  updatedBy: string | null;
};

export type DriverLaunchEnrollment = {
  id: string;
  driverId: string;
  driverName: string;
  status: DriverLaunchEnrollmentStatus;
  slotIndex: number;
  bonusAmountCad: number;
  requiredDeliveries: number;
  completedDeliveries: number;
  enrolledAtMs: number;
  bonusUnlockedAtMs: number | null;
  bonusPaidAtMs: number | null;
  lastOrderId: string | null;
};

export type DriverLaunchCampaignDashboard = {
  statusLabel: string;
  statusKind: 'off' | 'paused' | 'scheduled' | 'live' | 'full' | 'ended';
  eligibleDriverLimit: number;
  driversEnrolled: number;
  driversRemaining: number;
  driversCompleted: number;
  bonusesPaid: number;
  totalBudgetAllocatedCad: number;
  totalBudgetPaidCad: number;
  remainingBudgetCad: number;
  averageDriverProgress: number;
};

export function isDriverLaunchCampaignWindowOpen(
  settings: Pick<
    DriverLaunchCampaignSettings,
    'enabled' | 'startAtMs' | 'endAtMs'
  >,
  nowMs = Date.now(),
): boolean {
  if (!settings.enabled) return false;
  if (settings.startAtMs != null && nowMs < settings.startAtMs) return false;
  if (settings.endAtMs != null && nowMs > settings.endAtMs) return false;
  return true;
}

/** New enrollments allowed (existing enrollees may still progress when paused). */
export function canEnrollInDriverLaunchCampaign(
  settings: DriverLaunchCampaignSettings,
  nowMs = Date.now(),
): boolean {
  if (!isDriverLaunchCampaignWindowOpen(settings, nowMs)) return false;
  if (settings.paused) return false;
  if (settings.enrolledCount >= settings.eligibleDriverLimit) return false;
  return true;
}

/** Enrolled drivers may keep progressing until unlock or promo end. */
export function canProgressDriverLaunchCampaign(
  settings: Pick<
    DriverLaunchCampaignSettings,
    'enabled' | 'startAtMs' | 'endAtMs'
  >,
  nowMs = Date.now(),
): boolean {
  if (!settings.enabled) return false;
  if (settings.endAtMs != null && nowMs > settings.endAtMs) return false;
  return true;
}

export function buildDriverLaunchCampaignDashboard(
  settings: DriverLaunchCampaignSettings,
  nowMs = Date.now(),
): DriverLaunchCampaignDashboard {
  const limit = Math.max(0, settings.eligibleDriverLimit);
  const enrolled = Math.max(0, settings.enrolledCount);
  const remaining = Math.max(0, limit - enrolled);
  const allocated = limit * settings.bonusAmountCad;
  const paid = Math.max(0, settings.totalBudgetPaidCad);
  const avg =
    enrolled > 0
      ? Math.round((settings.progressSum / enrolled) * 1000) / 10
      : 0;

  let statusKind: DriverLaunchCampaignDashboard['statusKind'] = 'off';
  let statusLabel = 'Disabled';
  if (!settings.enabled) {
    statusKind = 'off';
    statusLabel = 'Disabled';
  } else if (settings.endAtMs != null && nowMs > settings.endAtMs) {
    statusKind = 'ended';
    statusLabel = 'Ended';
  } else if (settings.startAtMs != null && nowMs < settings.startAtMs) {
    statusKind = 'scheduled';
    statusLabel = 'Scheduled';
  } else if (settings.paused) {
    statusKind = 'paused';
    statusLabel = 'Paused';
  } else if (enrolled >= limit) {
    statusKind = 'full';
    statusLabel = 'Full (limit reached)';
  } else {
    statusKind = 'live';
    statusLabel = 'Live';
  }

  return {
    statusLabel,
    statusKind,
    eligibleDriverLimit: limit,
    driversEnrolled: enrolled,
    driversRemaining: remaining,
    driversCompleted: Math.max(0, settings.driversCompleted),
    bonusesPaid: Math.max(0, settings.bonusesPaid),
    totalBudgetAllocatedCad: allocated,
    totalBudgetPaidCad: paid,
    remainingBudgetCad: Math.max(0, allocated - paid),
    averageDriverProgress: Math.min(100, Math.max(0, avg)),
  };
}
