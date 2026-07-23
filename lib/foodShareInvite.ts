import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

export const FOOD_SHARE_WEB_ORIGIN = 'https://halforder.app';

export type FoodShareInviteMessageInput = {
  adminFoodShareId: string;
  foodName: string;
  restaurantName: string;
  sharedPrice: number;
  deliveryShare: number;
  totalPerUser: number;
  pickupOrDelivery: string;
  dateLabel: string;
  timeLabel: string;
  inviteLink: string;
};

export function buildFoodShareWebInviteUrl(
  adminFoodShareId: string,
  inviteId?: string | null,
): string {
  const id = encodeURIComponent(adminFoodShareId.trim());
  const base = `${FOOD_SHARE_WEB_ORIGIN}/food-share/${id}`;
  if (inviteId?.trim()) {
    return `${base}?invite=${encodeURIComponent(inviteId.trim())}`;
  }
  return base;
}

export function buildFoodShareAppInviteUrl(
  adminFoodShareId: string,
  inviteId?: string | null,
): string {
  const id = encodeURIComponent(adminFoodShareId.trim());
  const base = `halforder://food-share/${id}`;
  if (inviteId?.trim()) {
    return `${base}?invite=${encodeURIComponent(inviteId.trim())}`;
  }
  return base;
}

/** Prefer universal web link in messages (opens app when installed). */
export function buildFoodShareInviteLink(
  adminFoodShareId: string,
  inviteId?: string | null,
): string {
  return buildFoodShareWebInviteUrl(adminFoodShareId, inviteId);
}

export function resolvePickupOrDeliveryLabel(raw: Record<string, unknown>): string {
  const pickupOnly = raw.pickupOnly;
  const deliveryEnabled = raw.deliveryEnabled;
  if (pickupOnly === true || pickupOnly === 'true') return 'Pickup';
  if (deliveryEnabled === false) return 'Pickup';
  if (deliveryEnabled === true) return 'Delivery';
  const deliveryShare =
    typeof raw.deliveryShare === 'number'
      ? raw.deliveryShare
      : typeof raw.deliveryCost === 'number'
        ? raw.deliveryCost
        : 0;
  return deliveryShare > 0 ? 'Delivery' : 'Pickup / Delivery';
}

function isUsableLabel(value: string): boolean {
  const t = value.trim();
  return t.length > 0 && t !== '—' && t !== '-' && t.toLowerCase() !== 'n/a';
}

export function resolveShareDateLabel(raw: Record<string, unknown>): string {
  for (const key of ['pickupDate', 'deliveryDate', 'eventDate', 'date'] as const) {
    const v = raw[key];
    if (typeof v === 'string' && isUsableLabel(v)) return v.trim();
  }
  return '';
}

export function resolveShareTimeLabel(raw: Record<string, unknown>): string {
  for (const key of ['pickupTime', 'deliveryTime', 'eventTime', 'time'] as const) {
    const v = raw[key];
    if (typeof v === 'string' && isUsableLabel(v)) return v.trim();
  }
  return '';
}

function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

export function buildFoodShareInviteMessage(
  input: FoodShareInviteMessageInput,
): string {
  const lines = [
    'Join me on HalfOrder',
    '',
    `Food: ${input.foodName}`,
    `Restaurant: ${input.restaurantName}`,
    '',
    `Food share: ${formatMoney(input.sharedPrice)}`,
    `Delivery share: ${formatMoney(input.deliveryShare)}`,
    `Total per person: ${formatMoney(input.totalPerUser)}`,
    '',
    `Order type: ${input.pickupOrDelivery}`,
  ];

  if (isUsableLabel(input.dateLabel)) {
    lines.push(`Date: ${input.dateLabel.trim()}`);
  }
  if (isUsableLabel(input.timeLabel)) {
    lines.push(`Time: ${input.timeLabel.trim()}`);
  }

  lines.push('', 'Tap to join:', input.inviteLink);
  return lines.join('\n');
}

export function buildFoodShareWhatsAppUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

async function openExternalUrl(url: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    }
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

export async function shareFoodShareInviteViaShareSheet(
  message: string,
  inviteLink: string,
): Promise<boolean> {
  try {
    await Share.share({
      title: 'Share a meal on HalfOrder',
      message,
      url: Platform.OS === 'ios' ? inviteLink : undefined,
    });
    return true;
  } catch {
    return false;
  }
}

export async function shareFoodShareInviteViaWhatsApp(
  message: string,
  inviteLink: string,
): Promise<'whatsapp' | 'share_sheet'> {
  const waUrl = buildFoodShareWhatsAppUrl(message);
  const opened = await openExternalUrl(waUrl);
  if (opened) return 'whatsapp';
  await shareFoodShareInviteViaShareSheet(message, inviteLink);
  return 'share_sheet';
}
