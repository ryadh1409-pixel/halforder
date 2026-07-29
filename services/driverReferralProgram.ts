import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '@/services/firebase';
import type {
  DriverReferralAdminDashboard,
  DriverReferralCampaignSettings,
  DriverReferralDashboard,
} from '@/types/driverReferralProgram';
import { httpsCallable } from 'firebase/functions';

export const DRIVER_REFERRAL_PENDING_CODE_KEY =
  'halforder_driver_referral_code';

export function normalizeDriverReferralCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function isDriverReferralCode(value: unknown): boolean {
  return /^DRV[A-F0-9]{10}$/.test(normalizeDriverReferralCode(value));
}

export function buildDriverReferralQrUrl(inviteLink: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(inviteLink)}`;
}

export async function storePendingDriverReferralCode(
  code: string,
): Promise<boolean> {
  const normalized = normalizeDriverReferralCode(code);
  if (!isDriverReferralCode(normalized)) return false;
  await AsyncStorage.setItem(DRIVER_REFERRAL_PENDING_CODE_KEY, normalized);
  return true;
}

export async function applyPendingDriverReferralCode(): Promise<
  'none' | 'applied' | 'deferred'
> {
  const code = normalizeDriverReferralCode(
    await AsyncStorage.getItem(DRIVER_REFERRAL_PENDING_CODE_KEY),
  );
  if (!isDriverReferralCode(code)) return 'none';
  try {
    const callable = httpsCallable(functions, 'attachDriverReferral');
    await callable({ code });
    await AsyncStorage.removeItem(DRIVER_REFERRAL_PENDING_CODE_KEY);
    return 'applied';
  } catch {
    // Keep attribution through temporary auth/campaign/network failures.
    return 'deferred';
  }
}

export async function getDriverReferralDashboard(): Promise<DriverReferralDashboard> {
  const callable = httpsCallable(functions, 'getDriverReferralDashboard');
  const result = await callable({});
  return result.data as DriverReferralDashboard;
}

export async function getAdminDriverReferralCampaign(): Promise<DriverReferralAdminDashboard> {
  const callable = httpsCallable(functions, 'getAdminDriverReferralCampaign');
  const result = await callable({});
  return result.data as DriverReferralAdminDashboard;
}

export async function saveAdminDriverReferralCampaign(
  settings: Pick<
    DriverReferralCampaignSettings,
    | 'enabled'
    | 'visibleInDriverApp'
    | 'paused'
    | 'rewardType'
    | 'rewardPercentage'
    | 'fixedRewardCad'
    | 'campaignBudgetCad'
    | 'startAtMs'
    | 'endAtMs'
    | 'maxReferralsPerDriver'
    | 'minimumOrderValueCad'
    | 'requireCompletedPayment'
    | 'requireCompletedDelivery'
  >,
): Promise<void> {
  const callable = httpsCallable(functions, 'saveAdminDriverReferralCampaign');
  await callable(settings);
}

export async function updateDriverReferralRewardStatus(
  customerId: string,
  action: 'paid' | 'cancelled',
): Promise<void> {
  const callable = httpsCallable(functions, 'updateDriverReferralRewardStatus');
  await callable({ customerId, action });
}
