import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

export const COMPLETE_MEAL_WEB_ORIGIN = 'https://halforder.app';

export function buildCompleteMealShareUrl(shareToken: string): string {
  return `${COMPLETE_MEAL_WEB_ORIGIN}/complete-meal/contribute/${encodeURIComponent(shareToken.trim())}`;
}

export function buildCompleteMealAppShareUrl(shareToken: string): string {
  return `halforder://complete-meal/contribute/${encodeURIComponent(shareToken.trim())}`;
}

export async function shareCompleteMealInvite(input: {
  shareToken: string;
  ownerFirstName: string;
  restaurantName: string;
  remainingCents: number;
}): Promise<void> {
  const link = buildCompleteMealShareUrl(input.shareToken);
  const dollars = (input.remainingCents / 100).toFixed(2);
  const message =
    `🍔 ${input.ownerFirstName} is craving ${input.restaurantName}\n` +
    `Help complete this meal — $${dollars} still needed.\n\n${link}`;

  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
    await navigator.share({ title: 'Complete My Meal', text: message, url: link });
    return;
  }

  await Share.share({
    message,
    url: Platform.OS === 'ios' ? link : undefined,
    title: 'Complete My Meal',
  });
}

export async function openCompleteMealShareUrl(shareToken: string): Promise<void> {
  const url = buildCompleteMealShareUrl(shareToken);
  await Linking.openURL(url);
}
