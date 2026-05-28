import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

export type InviteShareInput = {
  orderId: string;
  restaurantName: string;
  totalOrderUsd: number | null;
  yourShareUsd: number | null;
  deliveryMode?: string | null;
  refUserId?: string | null;
};

function formatUsd(value: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `$${value.toFixed(0)}`;
}

function cleanOrderId(orderId: string): string {
  return orderId.trim() || 'order';
}

export function buildGroupInviteUrl(orderId: string, refUserId?: string | null): string {
  const id = encodeURIComponent(cleanOrderId(orderId));
  const base = `https://halforder.app/group/${id}`;
  if (refUserId?.trim()) {
    return `${base}?ref=${encodeURIComponent(refUserId.trim())}`;
  }
  return base;
}

export function buildViralInviteText(input: InviteShareInput): string {
  const joinUrl = buildGroupInviteUrl(input.orderId, input.refUserId);
  const restaurant = input.restaurantName?.trim() || 'Your favorite spot';
  const total = formatUsd(input.totalOrderUsd);
  const share = formatUsd(input.yourShareUsd);
  const deliveryMode = input.deliveryMode?.trim() || 'Shared delivery';

  return `🍔 Join my HalfOrder!

Split this meal with me and pay less.

📍 Restaurant: ${restaurant}
💵 Total Order: ${total}
🤝 Your Share: ${share}

🚚 ${deliveryMode}
🔥 Save money together

Join instantly:
${joinUrl}

Sent via HalfOrder`;
}

async function openUrl(url: string): Promise<boolean> {
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

export async function shareInviteSheet(input: InviteShareInput): Promise<boolean> {
  const message = buildViralInviteText(input);
  try {
    await Share.share({
      title: 'Share Invite',
      message,
      url: Platform.OS === 'ios' ? buildGroupInviteUrl(input.orderId, input.refUserId) : undefined,
    });
    return true;
  } catch {
    return false;
  }
}

export async function shareInviteViaWhatsApp(input: InviteShareInput): Promise<boolean> {
  const message = buildViralInviteText(input);
  const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const ok = await openUrl(waUrl);
  if (ok) return true;
  return shareInviteSheet(input);
}

export async function shareInviteViaIMessage(input: InviteShareInput): Promise<boolean> {
  const message = buildViralInviteText(input);
  const smsUrl = `sms:?body=${encodeURIComponent(message)}`;
  const ok = await openUrl(smsUrl);
  if (ok) return true;
  return shareInviteSheet(input);
}

export async function shareInviteViaTelegram(input: InviteShareInput): Promise<boolean> {
  const message = buildViralInviteText(input);
  const inviteUrl = buildGroupInviteUrl(input.orderId, input.refUserId);
  const tgWebUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(message)}`;
  const ok = await openUrl(tgWebUrl);
  if (ok) return true;
  return shareInviteSheet(input);
}

export async function shareInviteViaDiscord(input: InviteShareInput): Promise<boolean> {
  return shareInviteSheet(input);
}

export async function copyInviteLink(input: InviteShareInput): Promise<boolean> {
  const url = buildGroupInviteUrl(input.orderId, input.refUserId);
  try {
    await Clipboard.setStringAsync(url);
    return true;
  } catch {
    return false;
  }
}
