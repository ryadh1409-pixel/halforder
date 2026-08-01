import AsyncStorage from '@react-native-async-storage/async-storage';
import { functions } from '@/services/firebase';
import type {
  DriverReferralAdminDashboard,
  DriverReferralCampaignSettings,
  DriverReferralDashboard,
} from '@/types/driverReferralProgram';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { httpsCallable } from 'firebase/functions';

export const DRIVER_REFERRAL_PENDING_CODE_KEY =
  'halforder_driver_referral_code';

/** Shared invite destination — never use the website referral URL in share/copy/QR. */
export const DRIVER_REFERRAL_APP_STORE_URL =
  'https://apps.apple.com/ca/app/halforder/id6760587041';

export function normalizeDriverReferralCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function isDriverReferralCode(value: unknown): boolean {
  return /^DRV[A-F0-9]{10}$/.test(normalizeDriverReferralCode(value));
}

/** Matches server `codeForDriver` in `main/src/driverReferralProgram.ts`. */
export async function computeDriverReferralCode(driverId: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `halforder-driver-referral:${driverId}`,
  );
  return `DRV${hash.slice(0, 10).toUpperCase()}`;
}

export function buildDriverReferralInviteMessage(code: string): string {
  const referralCode = normalizeDriverReferralCode(code);
  return `Join me on HalfOrder and start earning by delivering food.

Download the app:
${DRIVER_REFERRAL_APP_STORE_URL}

Use my referral code:
${referralCode}

Sign up using this referral code to get started.`;
}

export function buildDriverReferralInviteLink(_code?: string): string {
  return DRIVER_REFERRAL_APP_STORE_URL;
}

export function buildDriverReferralQrUrl(inviteLink: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=12&data=${encodeURIComponent(inviteLink)}`;
}

function extractDriverReferralCodeFromText(value: string): string {
  const match = value.toUpperCase().match(/DRV[A-F0-9]{10}/);
  return match?.[0] ?? '';
}

export async function storePendingDriverReferralCode(
  code: string,
): Promise<boolean> {
  const normalized = normalizeDriverReferralCode(code);
  if (!isDriverReferralCode(normalized)) return false;
  await AsyncStorage.setItem(DRIVER_REFERRAL_PENDING_CODE_KEY, normalized);
  return true;
}

/**
 * Check clipboard for a driver referral code and save it to AsyncStorage.
 * Call this ONLY when the user explicitly taps "Paste code" — never on app launch.
 * Returns the found code or null.
 */
export async function checkClipboardForDriverReferralCode(): Promise<string | null> {
  try {
    const clip = await Clipboard.getStringAsync();
    const code = extractDriverReferralCodeFromText(clip ?? '');
    if (isDriverReferralCode(code)) {
      await AsyncStorage.setItem(DRIVER_REFERRAL_PENDING_CODE_KEY, code);
      return code;
    }
  } catch {
    // Clipboard unavailable
  }
  return null;
}

export async function applyPendingDriverReferralCode(): Promise<
  'none' | 'applied' | 'deferred'
> {
  // Only check AsyncStorage — clipboard is never read automatically (avoids iOS paste dialog on launch)
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
