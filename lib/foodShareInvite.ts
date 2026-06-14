import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

export const FOOD_SHARE_WEB_ORIGIN = 'https://ourfood.app';

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
  const base = `ourfood://food-share/${id}`;
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

export function resolveShareDateLabel(raw: Record<string, unknown>): string {
  for (const key of ['pickupDate', 'deliveryDate', 'eventDate', 'date'] as const) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '—';
}

export function resolveShareTimeLabel(raw: Record<string, unknown>): string {
  for (const key of ['pickupTime', 'deliveryTime', 'eventTime', 'time'] as const) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '—';
}

function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

export function buildFoodShareInviteMessage(
  input: FoodShareInviteMessageInput,
): string {
  return `🍔 Join me on OurFood

Food: ${input.foodName}
Restaurant: ${input.restaurantName}

Food Share: ${formatMoney(input.sharedPrice)}
Delivery Share: ${formatMoney(input.deliveryShare)}
Total Per Person: ${formatMoney(input.totalPerUser)}

Pickup / Delivery: ${input.pickupOrDelivery}

Date: ${input.dateLabel}
Time: ${input.timeLabel}

Tap to join:
${input.inviteLink}`;
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
      title: 'Share Food Together',
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
